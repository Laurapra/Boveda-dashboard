// supabase/functions/bepay-payouts/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BEPAY_BASE = "https://app.bepay.com.co/api/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getBepayToken(): Promise<string> {
  const res = await fetch(BEPAY_BASE + "/get-access-token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      email: Deno.env.get("BEPAY_EMAIL"),
      password: Deno.env.get("BEPAY_PASSWORD"),
    }),
  });
  const json = await res.json();
  if (!json.success) throw new Error("Bepay auth: " + json.message);
  return json.data;
}

function validateAmount(amount: unknown): number {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1000) throw new Error("Monto mínimo: $1.000 COP");
  if (n > 50000000) throw new Error("Monto máximo: $50.000.000 COP");
  return n;
}

function sanitize(value: unknown, maxLen = 255): string {
  if (typeof value !== "string") throw new Error("Valor inválido");
  const clean = value.trim().slice(0, maxLen);
  if (!clean) throw new Error("Campo requerido vacío");
  return clean;
}

async function checkOnboardingApproved(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<{ approved: boolean; status: string | null }> {
  const pnRes = await adminClient
    .from("onboarding_pn")
    .select("status")
    .eq("user_id", userId)
    .single();

  const empRes = await adminClient
    .from("onboarding_emp")
    .select("status")
    .eq("user_id", userId)
    .single();

  const ob = pnRes.data || empRes.data;
  if (!ob) return { approved: false, status: null };
  return { approved: ob.status === "approved", status: ob.status };
}

function onboardingErrorMessage(status: string | null): string {
  if (!status) return "Debes completar el Onboarding Bre-B antes de dispersar. Ve a la sección 'Onboarding Bre-B' en el menú.";
  if (status === "pending") return "Tu onboarding está pendiente de revisión. El administrador debe aprobarlo antes de dispersar.";
  if (status === "in_review") return "Tu onboarding está en revisión. Espera la aprobación del administrador.";
  return "Tu onboarding fue rechazado. Corrige la información y envía una nueva solicitud.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let authHeader: string | null;
    try {
      authHeader = req.headers.get("Authorization");
    } catch {
      authHeader = null;
    }

    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No autorizado — falta Authorization header" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Sesión inválida" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await userClient
      .from("profiles")
      .select("role, is_active, tarifa_enviar, tarifa_variable, full_name")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: "Perfil no encontrado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!profile.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Cuenta desactivada — contacta al administrador" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Cuerpo de la petición inválido" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, payload } = body;
    if (!action || typeof action !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Acción requerida" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getBepayToken();
    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    let result;

    switch (action) {

      // ── Lookup llave Bre-B ─────────────────────────────────────
      case "lookup_key": {
        const key = sanitize(payload?.key, 100);
        const res = await fetch(
          BEPAY_BASE + "/payout/get/" + encodeURIComponent(key),
          { headers: { "Authorization": "Bearer " + token, "Accept": "application/json" } }
        );
        result = await res.json();
        break;
      }

      // ── Dispersión Bre-B ───────────────────────────────────────
      case "payout_breb": {
        if (profile.role !== "admin") {
          const check = await checkOnboardingApproved(adminClient, user.id);
          if (!check.approved) throw new Error(onboardingErrorMessage(check.status));
        }

        const key = sanitize(payload?.key, 100);
        const amount = validateAmount(payload?.amount);
        const concept = sanitize(payload?.concept, 100);

        const comisionFija = profile.tarifa_enviar ?? 1190;
        const comisionVariable = Math.round(amount * (profile.tarifa_variable ?? 0.0012));
        const comisionTotal = comisionFija + comisionVariable;
        const reference = payload?.reference ? sanitize(payload.reference, 100) : "DISP-" + user.id.slice(0, 8) + "-" + Date.now();

        const res = await fetch(BEPAY_BASE + "/payout/breb/send", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            description: concept,
            account_id: accountId,
            payouts: [{ key_number: key, account_value: amount }],
          }),
        });
        const bepayResult = await res.json();

        const { data: txRow } = await adminClient.from("bepay_transactions").insert({
          user_id: user.id,
          bepay_ide: (bepayResult.data && (bepayResult.data.ide || bepayResult.data.id)) || reference,
          type: "payout",
          amount,
          concept,
          status: bepayResult.success ? "PENDING" : "FAILED",
          account_type: "Bre-B",
          account_key: key,
          reference,
          tarifa_aplicada: comisionFija,
          tarifa_variable: profile.tarifa_variable,
          comision_total: comisionTotal,
          raw_response: bepayResult.data || bepayResult,
        }).select().single();

        await adminClient.from("audit_log").insert({
          user_id: user.id,
          action: "PAYOUT_BREB",
          entity: "bepay_transaction",
          entity_id: (txRow && txRow.id) || reference,
          metadata: { amount, key, concept, success: bepayResult.success, comision_total: comisionTotal },
        });

        result = bepayResult;
        break;
      }

      // ── Dispersión ACH ─────────────────────────────────────────
      // ── Dispersión ACH ─────────────────────────────────────────
      case "payout_ach": {
        if (profile.role !== "admin") {
          const check = await checkOnboardingApproved(adminClient, user.id);
          if (!check.approved) throw new Error(onboardingErrorMessage(check.status));
        }

        const amount = validateAmount(payload?.amount);
        const concept = sanitize(payload?.concept, 100);
        if (!payload?.bank_code || !payload?.account_number || !payload?.account_type_code || !payload?.identification_type) {
          throw new Error("Faltan datos de la cuenta bancaria o del beneficiario");
        }

        const comisionFija = profile.tarifa_enviar ?? 1190;
        const comisionVariable = Math.round(amount * (profile.tarifa_variable ?? 0.0012));
        const comisionTotal = comisionFija + comisionVariable;
        const reference = payload?.reference ? sanitize(payload.reference, 100) : "ACH-" + user.id.slice(0, 8) + "-" + Date.now();

        const res = await fetch(BEPAY_BASE + "/payout/ach/send", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            description: concept,
            payouts: [
              {
                identification_type: payload.identification_type,
                identification_number: sanitize(payload.document_number, 20),
                beneficiary_name: sanitize(payload.holder_name, 40),
                account_type: payload.account_type_code,
                account_number: sanitize(payload.account_number, 17),
                bank_code: payload.bank_code,
                account_value: amount,
              },
            ],
          }),
        });
        const bepayResult = await res.json();

        await adminClient.from("bepay_transactions").insert({
          user_id: user.id,
          bepay_ide: (bepayResult.data && String(bepayResult.data.id)) || reference,
          type: "payout",
          amount,
          concept,
          status: bepayResult.success ? "PENDING" : "FAILED",
          ben_name: payload.holder_name,
          ben_doc_type: payload.document_type,
          ben_doc_number: payload.document_number,
          account_type: payload.account_type,
          bank_name: payload.bank_code,
          account_key: payload.account_number,
          reference,
          tarifa_aplicada: comisionFija,
          tarifa_variable: profile.tarifa_variable,
          comision_total: comisionTotal,
          raw_response: bepayResult.data || bepayResult,
        });

        await adminClient.from("audit_log").insert({
          user_id: user.id,
          action: "PAYOUT_ACH",
          entity: "bepay_transaction",
          entity_id: reference,
          metadata: { amount, concept, bank_code: payload.bank_code, success: bepayResult.success },
        });

        result = bepayResult;
        break;
      }

      // ── Códigos de bancos ──────────────────────────────────────
      case "get_bank_codes": {
        const res = await fetch(BEPAY_BASE + "/payout/bankCodes", {
          headers: { "Authorization": "Bearer " + token, "Accept": "application/json" },
        });
        result = await res.json();
        break;
      }

      // ── Estado de dispersión ───────────────────────────────────
      case "payout_status": {
        const payoutId = sanitize(payload?.payout_id, 100);
        const res = await fetch(
          BEPAY_BASE + "/payout/status/" + payoutId + "/" + accountId,
          { headers: { "Authorization": "Bearer " + token, "Accept": "application/json" } }
        );
        const statusResult = await res.json();

        if (statusResult.data && statusResult.data.status) {
          await adminClient.from("bepay_transactions")
            .update({ status: statusResult.data.status, updated_at: new Date().toISOString() })
            .eq("bepay_ide", payoutId);
        }
        result = statusResult;
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: "Acción '" + action + "' no reconocida" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[bepay-payouts]", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});