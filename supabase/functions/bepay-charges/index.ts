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

          // Si se aprobó y tenía llave virtual, incrementa su total recibido
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

      // ── Crear llave VIRTUAL (no llama a Bepay) ────────────────────
      case "create_virtual_key": {
  const reference = payload?.reference ? sanitize(payload.reference, 100) : null;
  const userPart  = user.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase();

  // Reintenta hasta 5 veces si hay choque de llave duplicada
  let lastError: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { count } = await adminClient
      .from("breb_keys")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const consecutivo = (count ?? 0) + 1 + attempt; // desplaza si hay colisión
    const virtualKey  = `rmpx${userPart}${String(consecutivo).padStart(2, "0")}`;

    const { data, error } = await adminClient.from("breb_keys").insert({
      user_id:          user.id,
      key_value:        virtualKey,
      reference,
      consecutivo,
      status:           "ACTIVE",
      is_virtual:       true,
      real_account_key: "@BETEST",
      bepay_response:   { note: "Llave virtual interna" },
    }).select().single();

    if (!error) {
      await adminClient.from("audit_log").insert({
        user_id:   user.id,
        action:    "CREATE_VIRTUAL_KEY",
        entity:    "breb_keys",
        entity_id: data.id,
        metadata:  { key_value: virtualKey, consecutivo },
      });
      result = { success: true, data };
      break;
    }

    // Si el error es de duplicado, reintenta con el siguiente número
    if (error.code === "23505") {
      lastError = error;
      continue;
    }

    throw new Error(error.message);
  }

  if (!result) throw new Error(lastError?.message ?? "No se pudo generar una llave única tras varios intentos");
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

        const colombiaId = 48; // Confirmado por respuesta real de Bepay

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