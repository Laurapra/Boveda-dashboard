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

      // ── Balance ────────────────────────────────────────────────
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

      // ── Métodos de pago ────────────────────────────────────────
      case "get_payment_methods": {
        const res = await fetch(`${BEPAY_BASE}/accounts/paymentmethods`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ account_id: accountId }),
        });
        result = await res.json();
        break;
      }

      // ── Crear link de cobro ────────────────────────────────────
      case "create_link": {
        const amount  = validateAmount(payload?.amount);
        const concept = sanitize(payload?.concept, 100);
        const ref     = `BOV-${user.id.slice(0,8)}-${Date.now()}`;

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
            tarifa_aplicada: profile.tarifa_recibir,
            tarifa_variable: profile.tarifa_variable,
            comision_total: profile.tarifa_recibir,
            raw_response: bepayResult.data,
          }).select().single();

          await writeAuditLog(adminClient, user.id, "CREATE_LINK", txRow?.id ?? ref, {
            amount, concept, bepay_ide: bepayResult.data.ide,
          });
        }

        result = bepayResult;
        break;
      }

      // ── Estado de transacción ──────────────────────────────────
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
        }

        result = statusResult;
        break;
      }

      // ── Listar transacciones ───────────────────────────────────
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

      // ── Registrar llave Bre-B ──────────────────────────────────
      case "register_breb_key": {
        const keyValue  = sanitize(payload?.key_value, 30);
        const reference = payload?.reference ?? "";

        if (!/^[a-zA-Z0-9._-]{3,30}$/.test(keyValue)) {
          throw new Error("Formato de llave inválido");
        }

        // Verificar duplicado
        const { data: existing } = await userClient
          .from("breb_keys")
          .select("id")
          .eq("user_id", user.id)
          .eq("key_value", keyValue)
          .single();

        if (existing) throw new Error(`La llave @${keyValue} ya está registrada`);

        // Contar solo llaves ACTIVE para el consecutivo
        const { count: existingCount } = await adminClient
          .from("breb_keys")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "ACTIVE");

        const consecutivo = (existingCount ?? 0) + 1;
        console.log("Consecutivo:", consecutivo, "activas:", existingCount);

        // Llamar a Bepay
        const res = await fetch(`${BEPAY_BASE}/bre-b/key/register`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            account_id: accountId,
            reference:  reference || `rmpx-${user.id.slice(0,8)}-${String(consecutivo).padStart(2,"0")}`,
            key_value:  keyValue,
          }),
        });
        const bepayResult = await res.json();
        console.log("register_breb_key:", JSON.stringify(bepayResult));

        // Guardar en Supabase siempre (éxito o fallo)
        const { error: dbErr } = await adminClient.from("breb_keys").insert({
          user_id:        user.id,
          key_value:      keyValue,
          reference:      reference || null,
          consecutivo,
          status:         bepayResult.success ? "ACTIVE" : "FAILED",
          bepay_response: bepayResult,
        });

        if (dbErr) console.error("Error guardando llave:", dbErr.message);

        await adminClient.from("audit_log").insert({
          user_id:   user.id,
          action:    "REGISTER_BREB_KEY",
          entity:    "breb_keys",
          entity_id: keyValue,
          metadata:  { key_value: keyValue, consecutivo, success: bepayResult.success },
        });

        result = bepayResult;
        break;
      }

      // ── Obtener llaves Bre-B ───────────────────────────────────
      case "get_breb_keys": {
        // Consultar Bepay
        const bepayRes = await fetch(`${BEPAY_BASE}/bre-b/key/get`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ account_id: accountId }),
        });
        const bepayKeys = await bepayRes.json();

        // Traer historial local
        const { data: localKeys } = await userClient
          .from("breb_keys")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        // Sincronizar status desde Bepay → Supabase
        if (bepayKeys.success && Array.isArray(bepayKeys.data)) {
          for (const bKey of bepayKeys.data) {
            const kv = bKey.key_value ?? bKey.key;
            if (kv) {
              await adminClient.from("breb_keys")
                .update({ status: bKey.status ?? "ACTIVE" })
                .eq("user_id", user.id)
                .eq("key_value", kv);
            }
          }
        }

        result = {
          success: true,
          data:  bepayKeys.data ?? localKeys ?? [],
          local: localKeys ?? [],
        };
        break;
      }

      // ── Bre-B registro comercio ────────────────────────────────
      case "breb_register": {
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
            force:                false,
          }),
        });
        result = await res.json();

        if (result.success) {
          await writeAuditLog(adminClient, user.id, "BREB_REGISTER", user.id, {
            commerce_name: payload.commerce_name,
            document_number: payload.document_number,
          });
        }
        break;
      }

      // ── Geografía ─────────────────────────────────────────────
      case "get_countries": {
        const res = await fetch(`${BEPAY_BASE}/countries`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        result = await res.json();
        break;
      }

      case "get_regions": {
        const countryId = payload?.country_id ?? 1;
        const res = await fetch(`${BEPAY_BASE}/regions/${countryId}`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        result = await res.json();
        break;
      }

      case "get_cities": {
        const countryId = payload?.country_id ?? 1;
        const regionId  = payload?.region_id;
        const url = regionId
          ? `${BEPAY_BASE}/cities/${countryId}/${regionId}`
          : `${BEPAY_BASE}/cities/${countryId}`;
        const res = await fetch(url, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        result = await res.json();
        break;
      }

      // ── Colombia geo con caché ────────────────────────────────
      case "get_colombia_geo": {
        // Verificar caché (24h)
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

        // Obtener países para encontrar el ID real de Colombia
        const countriesRes = await fetch(`${BEPAY_BASE}/countries`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        const countriesJson = await countriesRes.json();
        console.log("Países Bepay:", JSON.stringify(countriesJson));

        const colombia = countriesJson.data?.find(
  (c: { name?: string; code_country?: string; phone_code?: string; id: number }) =>
    c.name?.toLowerCase().includes("colombia") ||
    c.code_country === "CO" ||
    c.phone_code === "57"
);
const colombiaId = colombia?.id ?? 48; // 48 según la API real de Bepay
console.log("Colombia encontrada:", JSON.stringify(colombia));
console.log("Colombia ID:", colombiaId);

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

        console.log("Regiones:", regJson.success, "count:", regJson.data?.length);
        console.log("Ciudades:", citJson.success, "count:", citJson.data?.length);

        if (!regJson.success) throw new Error(`Error regiones: ${JSON.stringify(regJson.message)}`);
        if (!citJson.success) throw new Error(`Error ciudades: ${JSON.stringify(citJson.message)}`);

        const geoData = {
          colombia_id: colombiaId,
          regions:     regJson.data ?? [],
          cities:      citJson.data ?? [],
        };

        await adminClient.from("geo_cache").upsert({
          key:        "colombia_geo",
          data:       geoData,
          updated_at: new Date().toISOString(),
        });

        result = { success: true, data: geoData, from_cache: false };
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