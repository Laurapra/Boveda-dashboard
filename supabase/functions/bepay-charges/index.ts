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

function validateAmount(amount: unknown): number {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1000) throw new Error("Monto mínimo: $1.000 COP");
  if (n > 50_000_000) throw new Error("Monto máximo: $50.000.000 COP");
  return n;
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
        result = await res.json();
        break;
      }

      // ── Estado de transacción ─────────────────────────────────────
      case "transaction_status": {
        const ide = sanitize(payload?.ide, 100);

        const { data: txOwner } = await userClient
          .from("bepay_transactions")
          .select("id, user_id")
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

        if (statusResult.data?.status) {
          await adminClient.from("bepay_transactions")
            .update({ status: statusResult.data.status, raw_response: statusResult.data, updated_at: new Date().toISOString() })
            .eq("bepay_ide", ide);

          if (statusResult.data.status === "APPROVED" && txOwner) {
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

        const [regRes, citRes] = await Promise.all([
          fetch(`${BEPAY_BASE}/regions/${colombiaId}`, {
            headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
          }),
          fetch(`${BEPAY_BASE}/cities/${colombiaId}`, {
            headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
          }),
        ]);

        const regJson = await regRes.json();
        const citJson = await citRes.json();

        if (!regJson.success) throw new Error(`Error regiones: ${JSON.stringify(regJson.message)}`);
        if (!citJson.success) throw new Error(`Error ciudades: ${JSON.stringify(citJson.message)}`);

        const geoData = { colombia_id: colombiaId, regions: regJson.data ?? [], cities: citJson.data ?? [] };

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

        const perPage = payload?.per_page ?? 100;
        const res = await fetch(`${BEPAY_BASE}/Banks?per_page=${perPage}`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        const json = await res.json();
        if (!json.success) throw new Error(`Error bancos: ${JSON.stringify(json.message)}`);

        await adminClient.from("geo_cache").upsert({
          key: "banks", data: json.data, updated_at: new Date().toISOString(),
        });

        result = { success: true, data: json.data, from_cache: false };
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

        const res = await fetch(`${BEPAY_BASE}/pseBanks`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        const json = await res.json();
        if (!json.success) throw new Error(`Error bancos PSE: ${JSON.stringify(json.message)}`);

        await adminClient.from("geo_cache").upsert({
          key: "pse_banks", data: json.data, updated_at: new Date().toISOString(),
        });

        result = { success: true, data: json.data, from_cache: false };
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

        const perPage = payload?.per_page ?? 100;
        const res = await fetch(`${BEPAY_BASE}/ciiuCodes?per_page=${perPage}`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        const json = await res.json();
        if (!json.success) throw new Error(`Error códigos CIIU: ${JSON.stringify(json.message)}`);

        await adminClient.from("geo_cache").upsert({
          key: "ciiu_codes", data: json.data, updated_at: new Date().toISOString(),
        });

        result = { success: true, data: json.data, from_cache: false };
        break;
      }

      // ── Sincronizar cobros pendientes con el estado real de Bepay ──
      case "sync_pending_charges": {
        if (profile.role !== "admin") throw new Error("No autorizado");

        const { data: pending } = await adminClient
          .from("bepay_transactions")
          .select("id, bepay_ide")
          .eq("type", "charge")
          .eq("status", "PENDING")
          .limit(50);

        let updated = 0;
        let checked = 0;

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
            }
          } catch {
            // Continúa con la siguiente aunque una falle
          }
        }

        result = { success: true, checked, updated };
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