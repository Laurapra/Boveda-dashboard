// supabase/functions/bepay-charges/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BEPAY_BASE = "https://app.bepay.com.co/api/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getBepayToken(): Promise<string> {
  const res = await fetch(`${BEPAY_BASE}/get-access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      email:    Deno.env.get("BEPAY_EMAIL"),
      password: Deno.env.get("BEPAY_PASSWORD"),
    }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`Bepay auth: ${json.message}`);
  return json.data;
}

function sanitize(value: unknown, maxLen = 255): string {
  if (typeof value !== "string") throw new Error("Valor inválido");
  const clean = value.trim().slice(0, maxLen);
  if (!clean) throw new Error("Campo requerido vacío");
  return clean;
}

// Vencimiento de los links/QR de cobro generados — a los 30 minutos dejan
// de ser válidos localmente (se rechazan aunque Bepay todavía no haya dado
// un estado final). No cancela el link del lado de Bepay — eso requeriría
// un endpoint suyo que no tenemos confirmado — pero evita que nuestro
// sistema los deje "vivos" indefinidamente en PENDING.
const LINK_EXPIRATION_MS = 30 * 60 * 1000;

function validateAmount(amount: unknown): number {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1000) throw new Error("Monto mínimo: $1.000 COP");
  if (n > 50_000_000) throw new Error("Monto máximo: $50.000.000 COP");
  return n;
}

// El nombre real del campo que trae la imagen del QR en la respuesta de
// Bepay (/charges/qr) no está confirmado — se prueban varios nombres
// posibles en vez de asumir uno solo (mismo patrón defensivo que se usó
// para los webhooks, donde el nombre real de un campo terminó siendo
// distinto al que se había asumido). Si el valor encontrado no trae ya el
// prefijo "data:" ni es una URL http(s), se asume base64 crudo de una
// imagen y se envuelve como data URI — sin esto, un <img src="..."> con
// puro base64 sin el prefijo "data:image/png;base64," no renderiza nada,
// y descargarlo tal cual guarda un archivo que no abre ningún visor.
function extractQrImage(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const raw = data.qr ?? data.qrImage ?? data.qr_image ?? data.qr_code ?? data.qrCode
    ?? data.image ?? data.image_base64 ?? data.qr_base64 ?? data.base64 ?? null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

// Varios catálogos de Bepay (Banks, pseBanks, ciiuCodes, regions, cities)
// vienen paginados con un paginador tipo Laravel (meta.current_page /
// per_page / total) que NO respeta el "per_page" que mandamos en la URL —
// siempre devuelve un tamaño de página fijo (confirmado: pedimos
// per_page=200 en /Banks y la respuesta trajo meta.per_page=15,
// items_in_page=15, total=53). Como antes solo pedíamos la página 1, nos
// quedábamos con 15 de 53 bancos. Este helper recorre todas las páginas con
// "page" hasta juntar el total, y se detiene solo si la API deja de traer
// datos o si detecta que "page" no tuvo ningún efecto (mismo primer id que
// la vuelta anterior) para no quedar en un ciclo repitiendo la misma página.
async function fetchAllPages(url: string, token: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let lastFirstId: unknown = undefined;

  for (let page = 1; page <= 30; page++) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}page=${page}`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    });
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) break;

    const firstId = (json.data[0] as Record<string, unknown>)?.id;
    if (firstId !== undefined && firstId === lastFirstId) break;
    lastFirstId = firstId;

    all.push(...(json.data as Record<string, unknown>[]));

    const total = json.meta?.total;
    if (typeof total === "number" && all.length >= total) break;
  }

  return all;
}

// El catálogo /Banks de Bepay trae filas que no son bancos reales — ej.
// "A CONTINUACIÓN SELECCIONE SU BANCO" (un placeholder de su propio
// formulario) y "BAN100" (un código de prueba). Se filtran con un criterio
// conservador para no descartar bancos reales por error: solo se excluye
// texto de placeholder ("SELECCION...") o nombres que son puro código
// (letras+dígitos sin espacios, ej. "BAN100") — ningún banco real de la
// lista tiene esa forma.
function isJunkBankName(name: string): boolean {
  const upper = name.toUpperCase().trim();
  if (!upper) return true;
  if (upper.includes("SELECCION")) return true;
  if (/^[A-Z]{2,6}\d{1,6}$/.test(upper)) return true;
  return false;
}

async function writeAuditLog(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  action: string,
  entityId: string,
  metadata: object
) {
  await adminClient.from("audit_log").insert({
    user_id: userId, action,
    entity: "bepay_transaction",
    entity_id: entityId, metadata,
  });
}

async function checkOnboardingApproved(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<{ approved: boolean; status: string | null }> {
  const { data: obPn } = await adminClient
    .from("onboarding_pn")
    .select("status")
    .eq("user_id", userId)
    .single();

  const { data: obEmp } = await adminClient
    .from("onboarding_emp")
    .select("status")
    .eq("user_id", userId)
    .single();

  const ob = obPn ?? obEmp;
  if (!ob) return { approved: false, status: null };
  return { approved: ob.status === "approved", status: ob.status };
}

function onboardingErrorMessage(status: string | null): string {
  if (!status) return "Debes completar el Onboarding Bre-B antes de continuar. Ve a la sección 'Onboarding Bre-B' en el menú.";
  if (status === "pending") return "Tu onboarding está pendiente de revisión. El administrador debe aprobarlo antes de continuar.";
  if (status === "in_review") return "Tu onboarding está en revisión. Espera la aprobación del administrador.";
  return "Tu onboarding fue rechazado. Corrige la información y envía una nueva solicitud.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado — falta Authorization header");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Sesión inválida");

    const { data: profile } = await userClient
      .from("profiles")
      .select("role, is_active, tarifa_recibir, tarifa_enviar, tarifa_variable, full_name")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Perfil no encontrado");
    if (!profile.is_active) throw new Error("Cuenta desactivada — contacta al administrador");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, payload } = body;

    if (!action || typeof action !== "string") throw new Error("Acción requerida");

    const token     = await getBepayToken();
    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    let result;

    switch (action) {

      // ── Balance (solo admin) ────────────────────────────────────
      case "get_balance": {
        if (profile.role !== "admin") throw new Error("No autorizado");
        const res = await fetch(`${BEPAY_BASE}/account-balance`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ account_id: accountId }),
        });
        result = await res.json();
        break;
      }

      // ── Métodos de pago ──────────────────────────────────────────
      case "get_payment_methods": {
        const res = await fetch(`${BEPAY_BASE}/accounts/paymentmethods`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ account_id: accountId }),
        });
        result = await res.json();
        break;
      }

      // ── Crear link de cobro (con llave virtual opcional) ─────────
      case "create_link": {
        if (profile.role !== "admin") {
          const { approved, status } = await checkOnboardingApproved(adminClient, user.id);
          if (!approved) throw new Error(onboardingErrorMessage(status));
        }

        const amount     = validateAmount(payload?.amount);
        const concept    = sanitize(payload?.concept, 100);
        const virtualKey = payload?.virtual_key ? sanitize(payload.virtual_key, 30) : null;

        if (virtualKey) {
          const { data: keyOwner } = await userClient
            .from("breb_keys")
            .select("id, status")
            .eq("key_value", virtualKey)
            .eq("user_id", user.id)
            .single();
          if (!keyOwner) throw new Error("Llave no encontrada o no pertenece a tu cuenta");
          if (keyOwner.status !== "ACTIVE") throw new Error("Esta llave está inactiva");
        }

        const ref = virtualKey
          ? `${virtualKey}-${Date.now()}`
          : `BOV-${user.id.slice(0,8)}-${Date.now()}`;

        const res = await fetch(`${BEPAY_BASE}/charges/link`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            type: "link", reference: ref, currency_code: "COP", tax_percentage: 0,
            account_id: accountId, total: amount, description: concept,
            redirect_url: payload?.redirect_url ?? Deno.env.get("FRONTEND_URL"),
          }),
        });
        const bepayResult = await res.json();

        if (bepayResult.success && bepayResult.data) {
          const { data: txRow } = await adminClient.from("bepay_transactions").insert({
            user_id: user.id,
            bepay_ide: bepayResult.data.ide ?? bepayResult.data.id,
            type: "charge", amount, concept,
            status: "PENDING",
            bepay_link: bepayResult.data.link,
            reference: ref,
            account_key: virtualKey,
            tarifa_aplicada: profile.tarifa_recibir,
            tarifa_variable: profile.tarifa_variable,
            comision_total: profile.tarifa_recibir,
            expires_at: new Date(Date.now() + LINK_EXPIRATION_MS).toISOString(),
            raw_response: bepayResult.data,
          }).select().single();

          await writeAuditLog(adminClient, user.id, "CREATE_LINK", txRow?.id ?? ref, {
            amount, concept, virtual_key: virtualKey, bepay_ide: bepayResult.data.ide,
          });
        }

        result = bepayResult;
        break;
      }

      // ── Crear QR de cobro (con llave virtual opcional) ───────────
      case "create_qr": {
        if (profile.role !== "admin") {
          const { approved, status } = await checkOnboardingApproved(adminClient, user.id);
          if (!approved) throw new Error(onboardingErrorMessage(status));
        }

        const amount     = validateAmount(payload?.amount);
        const concept    = sanitize(payload?.concept, 100);
        const virtualKey = payload?.virtual_key ? sanitize(payload.virtual_key, 30) : null;
        const ref = virtualKey ? `${virtualKey}-${Date.now()}` : `BOV-${user.id.slice(0,8)}-${Date.now()}`;

        const res = await fetch(`${BEPAY_BASE}/charges/qr`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            type: "qr", reference: ref, currency_code: "COP", tax_percentage: 0,
            account_id: accountId, total: amount, description: concept,
          }),
        });
        const bepayResult = await res.json();
        const qrImage = extractQrImage(bepayResult?.data);

        // Antes esta acción no guardaba nada en bepay_transactions (a
        // diferencia de create_link) — el QR se generaba pero, si alguien
        // pagaba, el webhook no encontraba fila local y el cobro quedaba
        // invisible en Movimientos/Mis billeteras. Se guarda igual que un
        // link, marcando el concepto como QR dinámico para que el frontend
        // lo etiquete "Recaudo QR dinámico Bre-B".
        if (bepayResult.success && bepayResult.data) {
          const { data: txRow } = await adminClient.from("bepay_transactions").insert({
            user_id: user.id,
            bepay_ide: bepayResult.data.ide ?? bepayResult.data.id,
            type: "charge", amount, concept,
            status: "PENDING",
            bepay_link: bepayResult.data.link ?? null,
            reference: ref,
            account_key: virtualKey,
            payment_method: "MOVII_BREB_QR",
            tarifa_aplicada: profile.tarifa_recibir,
            tarifa_variable: profile.tarifa_variable,
            comision_total: profile.tarifa_recibir,
            expires_at: new Date(Date.now() + LINK_EXPIRATION_MS).toISOString(),
            raw_response: bepayResult.data,
          }).select().single();

          await writeAuditLog(adminClient, user.id, "CREATE_QR", txRow?.id ?? ref, {
            amount, concept, virtual_key: virtualKey, bepay_ide: bepayResult.data.ide,
          });
        }

        // Se normaliza el campo de imagen a "qr" para que el frontend tenga
        // un único nombre confiable que leer, sin dejar de mandar la
        // respuesta cruda de Bepay por si hace falta revisarla.
        result = {
          ...bepayResult,
          data: bepayResult.data ? { ...bepayResult.data, qr: qrImage } : bepayResult.data,
        };
        break;
      }

      // ── Estado de transacción ─────────────────────────────────────
      case "transaction_status": {
        const ide = sanitize(payload?.ide, 100);

        const { data: txOwner } = await userClient
          .from("bepay_transactions")
          .select("id, user_id, status, expires_at, created_at")
          .eq("bepay_ide", ide)
          .single();

        if (txOwner && txOwner.user_id !== user.id && profile.role !== "admin") {
          throw new Error("No autorizado para ver esta transacción");
        }

        const res = await fetch(
          `${BEPAY_BASE}/checkout/transactionStatus?ide=${ide}&account_id=${accountId}`,
          { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } }
        );
        const statusResult = await res.json();

        let finalStatus: string | undefined = statusResult.data?.status;

        // Si Bepay todavía no dio un estado final (sigue PENDING o no
        // respondió nada distinto) y el link/QR ya venció (30 min desde que
        // se creó), se rechaza localmente aquí mismo — así alguien que
        // consulta el estado de SU propio cobro ve "Rechazado" de inmediato
        // en vez de esperar a que un admin sincronice. Nunca pisa un estado
        // final que Bepay sí haya confirmado.
        if (txOwner && txOwner.status === "PENDING" && (!finalStatus || finalStatus === "PENDING")) {
          const expiresAt = txOwner.expires_at
            ? new Date(txOwner.expires_at)
            : new Date(new Date(txOwner.created_at).getTime() + LINK_EXPIRATION_MS);
          if (Date.now() > expiresAt.getTime()) finalStatus = "REJECTED";
        }

        if (finalStatus) {
          await adminClient.from("bepay_transactions")
            .update({ status: finalStatus, raw_response: statusResult.data ?? null, updated_at: new Date().toISOString() })
            .eq("bepay_ide", ide);

          if (finalStatus === "APPROVED" && txOwner) {
            const { data: txFull } = await adminClient
              .from("bepay_transactions")
              .select("account_key, amount, user_id")
              .eq("bepay_ide", ide)
              .single();
            if (txFull?.account_key) {
              await adminClient.rpc("increment_key_total", {
                p_key_value: txFull.account_key,
                p_user_id:   txFull.user_id,
                p_amount:    txFull.amount,
              });
            }
          }

          // Si el vencimiento local fue lo que decidió el rechazo (Bepay no
          // había mandado ese status todavía), se refleja en la respuesta
          // para que el frontend no se quede mostrando "Pendiente" con un
          // dato que ya no corresponde a lo que se guardó.
          if (finalStatus === "REJECTED" && statusResult.data?.status !== "REJECTED") {
            statusResult.data = { ...(statusResult.data ?? {}), status: "REJECTED" };
          }
        }

        result = statusResult;
        break;
      }

      // ── Listar transacciones del usuario ──────────────────────────
      case "list_my_transactions": {
        const { data: txns } = await userClient
          .from("bepay_transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        result = { success: true, data: txns ?? [] };
        break;
      }

      // ── Crear llave Bre-B (registrada de verdad en Bepay) ─────────
      case "create_virtual_key": {
        if (profile.role !== "admin") {
          const { approved, status } = await checkOnboardingApproved(adminClient, user.id);
          if (!approved) throw new Error(onboardingErrorMessage(status));
        }

        const reference = payload?.reference ? sanitize(payload.reference, 100) : null;

        // ── Base de la llave: la MISMA referencia que quedó guardada cuando
        // se registró a esta persona en Bepay (onboarding → register_in_bepay).
        // Antes esta función recalculaba su propia fórmula (RAMPLIX+dígitos)
        // en paralelo a la de onboarding/index.ts — cada vez que ajustábamos
        // el formato durante las pruebas, las dos fórmulas dejaban de
        // coincidir, y por eso Bepay decía "no se encontró el usuario Bre-b
        // para la cuenta". Ahora leemos directamente breb_reference (columna
        // agregada en la migración 20260801090000) para que sea imposible que
        // se desincronicen: quien registra al usuario decide la referencia,
        // esta función solo la reutiliza.
        const [pnDoc, empDoc] = await Promise.all([
          adminClient.from("onboarding_pn").select("breb_reference").eq("user_id", user.id).single(),
          adminClient.from("onboarding_emp").select("breb_reference").eq("user_id", user.id).single(),
        ]);
        const storedReference = pnDoc.data?.breb_reference ?? empDoc.data?.breb_reference ?? null;

        // Si todavía no hay una referencia guardada, es porque register_in_bepay
        // nunca se completó con éxito para esta persona (o nunca se corrió).
        // Antes de esto, la función "adivinaba" una referencia con la fórmula
        // del momento y se la mandaba a Bepay igual — eso es lo que producía
        // el confuso "no se encontró el usuario Bre-b para la cuenta": estábamos
        // enviando una referencia que Bepay nunca había visto. Ahora avisamos
        // con un mensaje claro en vez de intentar adivinar.
        if (!storedReference) {
          throw new Error(
            "Tu cuenta todavía no tiene un registro válido en Bepay Bre-B. " +
            "Pídele al administrador que revise el estado de tu onboarding y use " +
            "el botón 'Reintentar Bre-B' antes de crear una billetera."
          );
        }
        // "reference" (vincula la llave con el usuario Bre-b ya registrado, SIEMPRE
        // el subcomercio guardado — nunca se elige a mano) y "key_value" (el
        // alias público de la llave) son cosas DISTINTAS.
        //
        // Formato confirmado con soporte de Bepay (2 ago 2026) — y con una
        // corrección tras probarlo: Bepay AGREGA el prefijo "BE" por su
        // cuenta a lo que nosotros mandamos (comprobado: mandamos
        // "BERAMPLI00" y la llave final quedó "@BEBERAMPLI00" — el "BE" se
        // duplicó). Así que NOSOTROS ya no debemos incluir "BE" — solo
        // "RAMPLIX" + consecutivo; Bepay le antepone el "BE" al confirmarla.
        // "RAMPLIX" es un prefijo propio, no una palabra genérica, así que
        // no debería chocar con el alias real de otra persona en la red
        // (a diferencia de "jesus" o "minegocio", que sí chocaron antes).
        //
        // Si el formulario manda un key_value explícito, se usa tal cual
        // (validado en largo/caracteres). Si no manda nada, se genera
        // automáticamente con el consecutivo global siguiente.
        const manualKeyValue = payload?.key_value ? sanitize(payload.key_value, 13) : null;
        if (manualKeyValue && !/^[a-zA-Z0-9@._-]+$/.test(manualKeyValue)) {
          throw new Error("La llave solo puede tener letras, números y @ . _ -");
        }
        if (manualKeyValue && manualKeyValue.length > 13) {
          throw new Error("La llave no puede tener más de 13 caracteres");
        }
        // Bepay antepone "BE" automáticamente a lo que mandemos — si la
        // persona ya escribe algo que empieza con "BE" (a mano), quedaría
        // duplicado (ej. "BEBERAMPLI00", como pasó antes). Se avisa en vez
        // de arriesgarse a repetir el mismo error silenciosamente.
        if (manualKeyValue && /^be/i.test(manualKeyValue)) {
          throw new Error('No escribas "BE" al inicio — Bepay lo agrega automáticamente. Escribe solo el resto (ej. "RAMPLIX000").');
        }

        // Consecutivo GLOBAL (no por usuario) — el namespace de key_value es
        // compartido por toda la cuenta 437, así que dos clientes de Ramplix
        // no pueden terminar con el mismo RAMPLIX0NN.
        const { count: existingCount } = await adminClient
          .from("breb_keys")
          .select("*", { count: "exact", head: true })
          .ilike("key_value", "%ramplix%");
        const startConsecutivo = (existingCount ?? 0);
        const suffixNum = String(startConsecutivo).padStart(2, "0");

        // El límite real de Bepay parece más corto que los 13 caracteres que
        // reportan (ya falló con 10, 11 y 12 antes de agregar el "BE" que
        // ellos ponen). Por eso, si no mandaron un key_value manual,
        // probamos variantes cada vez MÁS CORTAS hasta que alguna pase.
        const candidates = manualKeyValue
          ? [manualKeyValue]
          : [
              `RAMPLIX${String(startConsecutivo).padStart(3, "0")}`, // 10 car. (+BE de Bepay = 12)
              `RAMPLI${suffixNum}`,                                  // 8 car.  (+BE = 10)
              `RAMPL${suffixNum}`,                                   // 7 car.  (+BE = 9)
              `RAMP${suffixNum}`,                                    // 6 car.  (+BE = 8)
              `RAM${suffixNum}`,                                     // 5 car.  (+BE = 7)
            ];

        let lastError: any = null;
        for (let attempt = 0; attempt < candidates.length; attempt++) {
          const virtualKey = candidates[attempt];

          // ── Registrar la llave REAL en Bepay antes de guardarla localmente ──
          // Antes esto solo se guardaba en nuestra tabla con un valor de relleno
          // ("@BETEST"), por lo que Bepay nunca supo que la llave existía —
          // de ahí el "esa llave generada no se encuentra registrada".
          // IMPORTANTE: "reference" aquí debe ser la MISMA referencia usada al
          // registrar al usuario Bre-b en el onboarding — es como Bepay
          // vincula esta llave con ese usuario ya registrado. La nota interna
          // que la persona escribe en el modal ("Referencia opcional") NO se
          // manda a Bepay, solo se guarda localmente.
          const bepayRes = await fetch(`${BEPAY_BASE}/bre-b/key/register`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
              account_id: accountId,
              reference:  storedReference,
              key_value:  virtualKey,
            }),
          });
          const bepayJson = await bepayRes.json();

          if (!bepayJson.success) {
            // Si Bepay rechaza esta llave (ej. ya existe), probamos el siguiente consecutivo.
            // Se incluye la llave y referencia intentadas en el mensaje para poder
            // diagnosticar sin depender de los logs de Supabase.
            const rawMsg = typeof bepayJson.message === "string" ? bepayJson.message : JSON.stringify(bepayJson.message ?? bepayJson);
            console.error("[create_virtual_key] Bepay rechazó", { attempt, virtualKey, reference: storedReference, rawMsg });
            lastError = new Error(`[key_value="${virtualKey}" (${virtualKey.length} car.), reference="${storedReference}"] ${rawMsg}`);
            continue;
          }

          // ── Llave final mostrada al usuario: "@BE" + lo que generamos ──
          // Confirmado con una prueba real: mandamos key_value="BERAMPLI00"
          // (ya con "BE" incluido) y Bepay devolvió la llave creada como
          // "@BEBERAMPLI00" — es decir, Bepay SIEMPRE antepone "BE" a lo que
          // mandamos, de forma predecible. Ahora que virtualKey ya NO incluye
          // "BE" (ver arriba), la llave real y final es simplemente
          // "@BE" + virtualKey. Construirla así es más confiable que tratar
          // de adivinar el nombre del campo en la respuesta de Bepay (que no
          // está documentado y puede no venir siempre) — pero igual guardamos
          // la respuesta completa en bepay_response por si hace falta revisar.
          const confirmedKey = `@BE${virtualKey}`;

          const { data, error } = await adminClient.from("breb_keys").insert({
            user_id:          user.id,
            key_value:        confirmedKey,
            reference,
            consecutivo:      startConsecutivo + attempt + 1,
            status:           "ACTIVE",
            is_virtual:       false,
            real_account_key: confirmedKey,
            bepay_response:   bepayJson.data ?? bepayJson,
          }).select().single();

          if (!error) {
            await adminClient.from("audit_log").insert({
              user_id:   user.id,
              action:    "CREATE_VIRTUAL_KEY",
              entity:    "breb_keys",
              entity_id: data.id,
              metadata:  { key_value: virtualKey, bepay_registered: true },
            });
            result = { success: true, data };
            break;
          }

          if (error.code === "23505") { lastError = error; continue; }
          throw new Error(error.message);
        }

        if (!result) throw new Error(lastError?.message ?? "No se pudo generar una llave única tras varios intentos");
        break;
      }

      // ── Verificar en Bepay si una llave está realmente activa ─────
      // Usa el endpoint que Bepay documenta para que el REMITENTE consulte
      // una llave antes de enviarle plata (GET /payout/get/{key}). Sirve para
      // diagnosticar "llave no disponible en Bre-b" desde Nequi/Nu: si Bepay
      // tampoco la reconoce, el problema es del registro (o de propagación a
      // la red Bre-B); si Bepay SÍ la reconoce pero el banco no, es un tema
      // de sincronización de la red Bre-B, no de nuestro código.
      case "check_breb_key": {
        const keyValue = sanitize(payload?.key_value, 30);

        if (profile.role !== "admin") {
          const { data: keyOwner } = await userClient
            .from("breb_keys")
            .select("id")
            .eq("key_value", keyValue)
            .eq("user_id", user.id)
            .single();
          if (!keyOwner) throw new Error("Llave no encontrada o no pertenece a tu cuenta");
        }

        // Probamos con y sin "@" — el ejemplo de Bepay para ENVIAR dinero a una
        // llave usa el formato "@BE12345678" (con arroba), mientras que el de
        // REGISTRAR una llave no la lleva ("minegocio"). No queda claro en la
        // documentación cuál espera este endpoint de consulta, así que
        // devolvemos ambos resultados para comparar de una vez.
        const [plainRes, atRes] = await Promise.all([
          fetch(`${BEPAY_BASE}/payout/get/${encodeURIComponent(keyValue)}`, {
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          }).then(r => r.json()),
          fetch(`${BEPAY_BASE}/payout/get/${encodeURIComponent("@" + keyValue)}`, {
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          }).then(r => r.json()),
        ]);
        result = {
          success: plainRes?.success === true || atRes?.success === true,
          data: { without_at: plainRes, with_at: atRes },
        };
        break;
      }

      // ── Listar SOLO las llaves virtuales del usuario actual ───────
      case "get_breb_keys": {
        const { data: localKeys, error } = await userClient
          .from("breb_keys")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        result = { success: true, data: localKeys ?? [] };
        break;
      }

      // ── Admin: ver TODAS las llaves virtuales de todos los usuarios ──
      case "get_all_virtual_keys": {
        if (profile.role !== "admin") throw new Error("No autorizado");

        const { data: allKeys, error } = await adminClient
          .from("breb_keys")
          .select(`
            id, key_value, reference, consecutivo, status, total_received, created_at,
            profiles!inner ( full_name, email )
          `)
          .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        result = { success: true, data: allKeys ?? [] };
        break;
      }

      // ── Desactivar llave virtual ──────────────────────────────────
      case "deactivate_virtual_key": {
        const keyId = sanitize(payload?.key_id, 100);

        const { error } = await adminClient
          .from("breb_keys")
          .update({ status: "INACTIVE", updated_at: new Date().toISOString() })
          .eq("id", keyId)
          .eq("user_id", user.id);

        if (error) throw new Error(error.message);
        result = { success: true };
        break;
      }

      // ── Onboarding comercio (una sola vez, cuenta 437) ────────────
      case "breb_register": {
        if (profile.role !== "admin") throw new Error("Solo el administrador puede registrar el comercio principal");

        const required = ["mobile_number","document_type","document_number","first_name","first_surname","dane_code","commerce_name","email","gender","address","birth_place","dob","issue_date"];
        for (const field of required) {
          if (!payload?.[field]) throw new Error(`Campo requerido: ${field}`);
        }

        if (!/^3[0-6][0-9]{8}$/.test(String(payload.mobile_number))) {
          throw new Error("Celular inválido. Debe ser un número colombiano de 10 dígitos.");
        }

        const res = await fetch(`${BEPAY_BASE}/bre-b/register`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            account_id:           accountId,
            reference:            payload.reference ?? null,
            party_type:           "COMMERCE",
            mobile_number:        Number(payload.mobile_number),
            document_type:        payload.document_type,
            document_number:      String(payload.document_number),
            first_name:           sanitize(payload.first_name, 25),
            middle_name:          payload.middle_name ? sanitize(payload.middle_name, 25) : "",
            first_surname:        sanitize(payload.first_surname, 25),
            middle_surname:       payload.middle_surname ? sanitize(payload.middle_surname, 25) : "",
            dane_code:            String(payload.dane_code),
            commerce_name:        sanitize(payload.commerce_name, 45),
            email:                sanitize(payload.email, 100),
            source:               "Web",
            gender:               payload.gender,
            address:              sanitize(payload.address, 70),
            birth_place:          sanitize(payload.birth_place, 70),
            dob:                  payload.dob,
            issue_date:           payload.issue_date,
            terms_and_conditions: true,
            use_wrapper:          "bepay",
            force:                payload.force ?? false,
          }),
        });
        result = await res.json();

        if (result.success) {
          await writeAuditLog(adminClient, user.id, "BREB_REGISTER", accountId.toString(), {
            commerce_name: payload.commerce_name,
          });
        }
        break;
      }

      // ── Geografía ──────────────────────────────────────────────────
      case "get_countries": {
        const res = await fetch(`${BEPAY_BASE}/countries`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        result = await res.json();
        break;
      }

      case "get_colombia_geo": {
        const { data: cached } = await adminClient
          .from("geo_cache")
          .select("data, updated_at")
          .eq("key", "colombia_geo")
          .single();

        if (cached) {
          const age = Date.now() - new Date(cached.updated_at).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            result = { success: true, data: cached.data, from_cache: true };
            break;
          }
        }

        const colombiaId = 48;

        // Colombia tiene 32 departamentos y más de 1000 ciudades/municipios —
        // sin recorrer todas las páginas nos quedábamos con solo las
        // primeras 15 de cada una (mismo problema detectado en /Banks).
        const [regions, cities] = await Promise.all([
          fetchAllPages(`${BEPAY_BASE}/regions/${colombiaId}`, token),
          fetchAllPages(`${BEPAY_BASE}/cities/${colombiaId}`, token),
        ]);

        if (regions.length === 0) throw new Error("Error regiones: la API de Bepay no devolvió datos");
        if (cities.length === 0) throw new Error("Error ciudades: la API de Bepay no devolvió datos");

        const geoData = { colombia_id: colombiaId, regions, cities };

        await adminClient.from("geo_cache").upsert({
          key: "colombia_geo", data: geoData, updated_at: new Date().toISOString(),
        });

        result = { success: true, data: geoData, from_cache: false };
        break;
      }

      // ── Tipos de documento (con caché) ────────────────────────────
      case "get_document_types": {
        const { data: cached } = await adminClient
          .from("geo_cache")
          .select("data, updated_at")
          .eq("key", "document_types")
          .single();

        if (cached) {
          const age = Date.now() - new Date(cached.updated_at).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            result = { success: true, data: cached.data, from_cache: true };
            break;
          }
        }

        const res = await fetch(`${BEPAY_BASE}/documentTypes`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        const json = await res.json();
        if (!json.success) throw new Error(`Error tipos de documento: ${JSON.stringify(json.message)}`);

        await adminClient.from("geo_cache").upsert({
          key: "document_types", data: json.data, updated_at: new Date().toISOString(),
        });

        result = { success: true, data: json.data, from_cache: false };
        break;
      }

      // ── Bancos (con caché) ─────────────────────────────────────────
      case "get_banks": {
        const { data: cached } = await adminClient
          .from("geo_cache")
          .select("data, updated_at")
          .eq("key", "banks")
          .single();

        if (cached) {
          const age = Date.now() - new Date(cached.updated_at).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            result = { success: true, data: cached.data, from_cache: true };
            break;
          }
        }

        const allBanks = await fetchAllPages(`${BEPAY_BASE}/Banks`, token);
        const banks = allBanks.filter((b) => {
          const name = String((b as Record<string, unknown>)?.name ?? "");
          return name.trim() && !isJunkBankName(name);
        });
        if (banks.length === 0) throw new Error("Error bancos: la API de Bepay no devolvió bancos válidos");

        await adminClient.from("geo_cache").upsert({
          key: "banks", data: banks, updated_at: new Date().toISOString(),
        });

        result = { success: true, data: banks, from_cache: false };
        break;
      }

      // ── Bancos PSE (con caché) ───────────────────────────────────────
      case "get_pse_banks": {
        const { data: cached } = await adminClient
          .from("geo_cache")
          .select("data, updated_at")
          .eq("key", "pse_banks")
          .single();

        if (cached) {
          const age = Date.now() - new Date(cached.updated_at).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            result = { success: true, data: cached.data, from_cache: true };
            break;
          }
        }

        const pseBanks = await fetchAllPages(`${BEPAY_BASE}/pseBanks`, token);
        if (pseBanks.length === 0) throw new Error("Error bancos PSE: la API de Bepay no devolvió datos");

        await adminClient.from("geo_cache").upsert({
          key: "pse_banks", data: pseBanks, updated_at: new Date().toISOString(),
        });

        result = { success: true, data: pseBanks, from_cache: false };
        break;
      }

      // ── Códigos CIIU (con caché) ──────────────────────────────────
      case "get_ciiu_codes": {
        const { data: cached } = await adminClient
          .from("geo_cache")
          .select("data, updated_at")
          .eq("key", "ciiu_codes")
          .single();

        if (cached) {
          const age = Date.now() - new Date(cached.updated_at).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            result = { success: true, data: cached.data, from_cache: true };
            break;
          }
        }

        const ciiuCodes = await fetchAllPages(`${BEPAY_BASE}/ciiuCodes`, token);
        if (ciiuCodes.length === 0) throw new Error("Error códigos CIIU: la API de Bepay no devolvió datos");

        await adminClient.from("geo_cache").upsert({
          key: "ciiu_codes", data: ciiuCodes, updated_at: new Date().toISOString(),
        });

        result = { success: true, data: ciiuCodes, from_cache: false };
        break;
      }

      // ── Sincronizar cobros pendientes con el estado real de Bepay ──
      // Normalmente los cobros por link de pago quedan en PENDING y la API
      // de Bepay no siempre notifica el rechazo. Por eso primero se
      // reconsulta el estado real en Bepay (como antes); solo si Bepay
      // TODAVÍA no da un estado final y ya pasaron 30 minutos desde que se
      // creó el cobro, se marca RECHAZADO localmente como último recurso —
      // nunca se rechaza de entrada solo por haber pasado el tiempo.
      case "sync_pending_charges": {
        if (profile.role !== "admin") throw new Error("No autorizado");

        const { data: pending } = await adminClient
          .from("bepay_transactions")
          .select("id, bepay_ide, user_id, created_at, expires_at")
          .eq("type", "charge")
          .eq("status", "PENDING")
          .limit(50);

        let updated = 0;
        let checked = 0;
        let expired = 0;

        for (const tx of pending ?? []) {
          if (!tx.bepay_ide) continue;
          checked++;

          try {
            const res = await fetch(
              `${BEPAY_BASE}/checkout/transactionStatus?ide=${tx.bepay_ide}&account_id=${accountId}`,
              { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } }
            );
            const statusJson = await res.json();

            if (statusJson.data?.status && statusJson.data.status !== "PENDING") {
              await adminClient.from("bepay_transactions")
                .update({ status: statusJson.data.status, raw_response: statusJson.data, updated_at: new Date().toISOString() })
                .eq("id", tx.id);

              if (statusJson.data.status === "APPROVED") {
                const { data: txFull } = await adminClient
                  .from("bepay_transactions")
                  .select("account_key, amount, user_id")
                  .eq("id", tx.id)
                  .single();
                if (txFull?.account_key) {
                  await adminClient.rpc("increment_key_total", {
                    p_key_value: txFull.account_key,
                    p_user_id:   txFull.user_id,
                    p_amount:    txFull.amount,
                  });
                }
              }
              updated++;
            } else {
              // Bepay sigue sin dar un estado final — solo si ya pasó el
              // vencimiento (expires_at, o created_at + 30 min como
              // respaldo para filas creadas antes de que existiera esta
              // columna) se marca RECHAZADO local como fallback (los cobros
              // nunca debitan saldo al crearse, así que rechazar aquí no
              // requiere reintegrar nada).
              const expiresAt = tx.expires_at
                ? new Date(tx.expires_at)
                : new Date(new Date(tx.created_at).getTime() + LINK_EXPIRATION_MS);
              if (Date.now() > expiresAt.getTime()) {
                await adminClient.from("bepay_transactions")
                  .update({ status: "REJECTED", updated_at: new Date().toISOString() })
                  .eq("id", tx.id);

                await adminClient.from("audit_log").insert({
                  user_id:   tx.user_id,
                  action:    "CHARGE_TIMEOUT_REJECTED",
                  entity:    "bepay_transaction",
                  entity_id: tx.id,
                  metadata:  {
                    bepay_ide: tx.bepay_ide,
                    age_minutes: Math.round((Date.now() - new Date(tx.created_at).getTime()) / 60000),
                    last_bepay_status: statusJson.data?.status ?? null,
                  },
                });
                expired++;
              }
            }
          } catch {
            // Continúa con la siguiente aunque una falle
          }
        }

        result = { success: true, checked, updated, expired };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Acción '${action}' no reconocida` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[bepay-charges]", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});