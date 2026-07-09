// supabase/functions/bepay-charges/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BEPAY_BASE = "https://app.bepay.com.co/api/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Helpers ───────────────────────────────────────────────────────
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

// Valida y sanitiza string — previene inyecciones
function sanitize(value: unknown, maxLen = 255): string {
  if (typeof value !== "string") throw new Error("Valor inválido");
  const clean = value.trim().slice(0, maxLen);
  if (!clean) throw new Error("Campo requerido vacío");
  return clean;
}

function validateAmount(amount: unknown): number {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1000) throw new Error("Monto mínimo: $1.000 COP");
  if (n > 50_000_000) throw new Error("Monto máximo: $50.000.000 COP por transacción");
  return n;
}

// ── Audit log ─────────────────────────────────────────────────────
async function writeAuditLog(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  action: string,
  entityId: string,
  metadata: object
) {
  await adminClient.from("audit_log").insert({
    user_id:   userId,
    action,
    entity:    "bepay_transaction",
    entity_id: entityId,
    metadata,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Autenticación: verificar que hay sesión válida ────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado — falta Authorization header");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Sesión inválida");

    // ── Verificar que el usuario está activo ──────────────────────
    const { data: profile } = await userClient
      .from("profiles")
      .select("role, is_active, tarifa_recibir, tarifa_enviar, tarifa_variable, full_name")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Perfil no encontrado");
    if (!profile.is_active) throw new Error("Cuenta desactivada — contacta al administrador");

    // Cliente admin para escribir en DB con service role
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
        // Solo admin puede ver el balance real de la cuenta Bepay
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
        const amount    = validateAmount(payload?.amount);
        const concept   = sanitize(payload?.concept, 100);
        const reference = `BOV-${user.id.slice(0,8)}-${Date.now()}`;

        const res = await fetch(`${BEPAY_BASE}/charges/link`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            type: "link", reference, currency_code: "COP", tax_percentage: 0,
            account_id: accountId, total: amount, description: concept,
            redirect_url: payload?.redirect_url ?? Deno.env.get("FRONTEND_URL"),
          }),
        });
        const bepayResult = await res.json();

        if (bepayResult.success && bepayResult.data) {
          // Guardar en DB con tarifas del usuario
          const { data: txRow } = await adminClient.from("bepay_transactions").insert({
            user_id:         user.id,
            bepay_ide:       bepayResult.data.ide ?? bepayResult.data.id,
            type:            "charge",
            amount,
            concept,
            status:          "PENDING",
            bepay_link:      bepayResult.data.link,
            reference,
            tarifa_aplicada: profile.tarifa_recibir,
            tarifa_variable: profile.tarifa_variable,
            comision_total:  profile.tarifa_recibir,
            raw_response:    bepayResult.data,
          }).select().single();

          // Audit log
          await writeAuditLog(adminClient, user.id, "CREATE_LINK", txRow?.id ?? reference, { amount, concept, bepay_ide: bepayResult.data.ide });
        }

        result = bepayResult;
        break;
      }

      // ── Estado de una transacción ──────────────────────────────
      case "transaction_status": {
        const ide = sanitize(payload?.ide, 100);

        // Verificar que la transacción pertenece al usuario
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

        // Actualizar estado en DB
        if (statusResult.data?.status) {
          await adminClient.from("bepay_transactions")
            .update({ status: statusResult.data.status, raw_response: statusResult.data, updated_at: new Date().toISOString() })
            .eq("bepay_ide", ide);
        }

        result = statusResult;
        break;
      }

      // ── Listar transacciones del usuario ───────────────────────
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

      // ── Bre-B: registrar llave ─────────────────────────────────
      case "register_breb_key": {
        const keyValue  = sanitize(payload?.key_value, 30);
        const reference = payload?.reference ? sanitize(payload.reference, 100) : "";

        // Validar formato de llave
        if (!/^[a-zA-Z0-9._-]{3,30}$/.test(keyValue)) {
          throw new Error("Formato de llave inválido. Solo letras, números, puntos y guiones.");
        }

        const res = await fetch(`${BEPAY_BASE}/bre-b/key/register`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ account_id: accountId, reference, key_value: keyValue }),
        });
        result = await res.json();

        await writeAuditLog(adminClient, user.id, "REGISTER_BREB_KEY", keyValue, { key_value: keyValue });
        break;
      }

      // ── Bre-B: listar llaves ───────────────────────────────────
      case "get_breb_keys": {
        const res = await fetch(`${BEPAY_BASE}/bre-b/key/get`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ account_id: accountId }),
        });
        result = await res.json();
        break;
      }

      // ── Bre-B: onboarding ──────────────────────────────────────
      case "breb_register": {
        // Validar campos requeridos del onboarding
        const required = ["mobile_number","document_type","document_number","first_name","first_surname","dane_code","commerce_name","email","gender","address","birth_place","dob","issue_date"];
        for (const field of required) {
          if (!payload?.[field]) throw new Error(`Campo requerido: ${field}`);
        }

        // Validar celular colombiano
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