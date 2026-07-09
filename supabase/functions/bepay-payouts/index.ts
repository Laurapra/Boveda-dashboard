// supabase/functions/bepay-payouts/index.ts
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

function validateAmount(amount: unknown): number {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1000)    throw new Error("Monto mínimo: $1.000 COP");
  if (n > 50_000_000)                       throw new Error("Monto máximo: $50.000.000 COP");
  return n;
}

function sanitize(value: unknown, maxLen = 255): string {
  if (typeof value !== "string") throw new Error("Valor inválido");
  const clean = value.trim().slice(0, maxLen);
  if (!clean) throw new Error("Campo requerido vacío");
  return clean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Sesión inválida");

    const { data: profile } = await userClient
      .from("profiles")
      .select("is_active, tarifa_enviar, tarifa_variable, full_name")
      .eq("id", user.id)
      .single();

    if (!profile?.is_active) throw new Error("Cuenta desactivada");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, payload } = await req.json();
    const token     = await getBepayToken();
    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    let result;

    switch (action) {

      // ── Lookup llave Bre-B ─────────────────────────────────────
      case "lookup_key": {
        const key = sanitize(payload?.key, 100);
        const res = await fetch(
          `${BEPAY_BASE}/payout/get/${encodeURIComponent(key)}`,
          { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } }
        );
        result = await res.json();
        break;
      }

      // ── Dispersión Bre-B ───────────────────────────────────────
      case "payout_breb": {
        const key     = sanitize(payload?.key, 100);
        const amount  = validateAmount(payload?.amount);
        const concept = sanitize(payload?.concept, 100);

        // Calcular comisión con la tarifa del usuario
        const comisionFija     = profile.tarifa_enviar ?? 1190;
        const comisionVariable = Math.round(amount * (profile.tarifa_variable ?? 0.0012));
        const comisionTotal    = comisionFija + comisionVariable;
        const reference        = `DISP-${user.id.slice(0,8)}-${Date.now()}`;

        const res = await fetch(`${BEPAY_BASE}/payout/breb/send`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            description: concept,
            account_id:  accountId,
            payouts: [{ key_number: key, account_value: amount }],
          }),
        });
        const bepayResult = await res.json();

        // Guardar en DB independientemente del resultado
        const { data: txRow } = await adminClient.from("bepay_transactions").insert({
          user_id:         user.id,
          bepay_ide:       bepayResult.data?.ide ?? bepayResult.data?.id ?? reference,
          type:            "payout",
          amount,
          concept,
          status:          bepayResult.success ? "PENDING" : "FAILED",
          account_type:    "Bre-B",
          account_key:     key,
          reference,
          tarifa_aplicada: comisionFija,
          tarifa_variable: profile.tarifa_variable,
          comision_total:  comisionTotal,
          raw_response:    bepayResult.data ?? bepayResult,
        }).select().single();

        // Audit log (siempre — especialmente si falla)
        await adminClient.from("audit_log").insert({
          user_id:   user.id,
          action:    "PAYOUT_BREB",
          entity:    "bepay_transaction",
          entity_id: txRow?.id ?? reference,
          metadata:  {
            amount, key, concept,
            success:       bepayResult.success,
            comision_total: comisionTotal,
          },
        });

        result = bepayResult;
        break;
      }

      // ── Dispersión ACH ─────────────────────────────────────────
      case "payout_ach": {
        const amount  = validateAmount(payload?.amount);
        const concept = sanitize(payload?.concept, 100);
        if (!payload?.bank_code || !payload?.account_number || !payload?.account_type) {
          throw new Error("Banco, número y tipo de cuenta son requeridos");
        }

        const comisionFija     = profile.tarifa_enviar ?? 1190;
        const comisionVariable = Math.round(amount * (profile.tarifa_variable ?? 0.0012));
        const comisionTotal    = comisionFija + comisionVariable;
        const reference        = `ACH-${user.id.slice(0,8)}-${Date.now()}`;

        const res = await fetch(`${BEPAY_BASE}/payout/ach/send`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            account_id:      accountId,
            bank_code:       payload.bank_code,
            account_number:  sanitize(payload.account_number, 30),
            account_type:    payload.account_type,
            document_type:   payload.document_type,
            document_number: sanitize(payload.document_number, 20),
            name:            sanitize(payload.holder_name, 100),
            amount,
            description:     concept,
            reference,
          }),
        });
        const bepayResult = await res.json();

        await adminClient.from("bepay_transactions").insert({
          user_id:         user.id,
          bepay_ide:       bepayResult.data?.ide ?? reference,
          type:            "payout",
          amount, concept,
          status:          bepayResult.success ? "PENDING" : "FAILED",
          ben_name:        payload.holder_name,
          ben_doc_type:    payload.document_type,
          ben_doc_number:  payload.document_number,
          account_type:    payload.account_type,
          bank_name:       payload.bank_code,
          account_key:     payload.account_number,
          reference,
          tarifa_aplicada: comisionFija,
          tarifa_variable: profile.tarifa_variable,
          comision_total:  comisionTotal,
          raw_response:    bepayResult.data ?? bepayResult,
        });

        await adminClient.from("audit_log").insert({
          user_id:   user.id,
          action:    "PAYOUT_ACH",
          entity:    "bepay_transaction",
          entity_id: reference,
          metadata:  { amount, concept, bank_code: payload.bank_code, success: bepayResult.success },
        });

        result = bepayResult;
        break;
      }

      // ── Códigos de bancos ──────────────────────────────────────
      case "get_bank_codes": {
        const res = await fetch(`${BEPAY_BASE}/payout/bankCodes`, {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        });
        result = await res.json();
        break;
      }

      // ── Estado de dispersión ───────────────────────────────────
      case "payout_status": {
        const payoutId = sanitize(payload?.payout_id, 100);
        const res = await fetch(
          `${BEPAY_BASE}/payout/status/${payoutId}/${accountId}`,
          { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } }
        );
        const statusResult = await res.json();

        if (statusResult.data?.status) {
          await adminClient.from("bepay_transactions")
            .update({ status: statusResult.data.status, updated_at: new Date().toISOString() })
            .eq("bepay_ide", payoutId);
        }
        result = statusResult;
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
    console.error("[bepay-payouts]", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});