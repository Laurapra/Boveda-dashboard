// supabase/functions/bepay-nequi-push/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BEPAY_BASE = "https://app.bepay.com.co/api/v1";
const BEMOVIL_BASE = "https://apiv2.bemovil.net/api/v1/api/v1";
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
  if (n > 50_000_000) throw new Error("Monto máximo: $50.000.000 COP");
  return n;
}

// Celular colombiano: 10 dígitos, empieza en 3
function validateCellphone(value: unknown): string {
  const clean = String(value ?? "").replace(/\D/g, "");
  if (!/^3\d{9}$/.test(clean)) {
    throw new Error("Número de celular inválido — debe ser un celular colombiano de 10 dígitos (ej. 3001234567)");
  }
  return clean;
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
  const pnRes = await adminClient.from("onboarding_pn").select("status").eq("user_id", userId).maybeSingle();
  const empRes = await adminClient.from("onboarding_emp").select("status").eq("user_id", userId).maybeSingle();
  const ob = pnRes.data || empRes.data;
  if (!ob) return { approved: false, status: null };
  return { approved: ob.status === "approved", status: ob.status };
}

function onboardingErrorMessage(status: string | null): string {
  if (!status) return "Debes completar el Onboarding antes de cobrar. Ve a la sección 'Onboarding' en el menú.";
  if (status === "pending") return "Tu onboarding está pendiente de revisión.";
  if (status === "in_review") return "Tu onboarding está en revisión.";
  return "Tu onboarding fue rechazado. Corrige la información y envía una nueva solicitud.";
}

// La respuesta de apiv2.bemovil.net puede traer el identificador de la
// transacción bajo distintos nombres según el campo — se prueban todos.
function extractTransactionIde(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const raw = obj.ide ?? obj.id ?? obj.transaction_id ?? obj.transaction_ide;
  if (raw === undefined || raw === null || raw === "") return null;
  return String(raw);
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
      .select("role, is_active, tarifa_recibir, tarifa_variable")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Perfil no encontrado");
    if (!profile.is_active) throw new Error("Cuenta desactivada — contacta al administrador");

    if (profile.role !== "admin") {
      const adminClientForCheck = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { approved, status } = await checkOnboardingApproved(adminClientForCheck, user.id);
      if (!approved) throw new Error(onboardingErrorMessage(status));
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, payload } = body;
    if (action !== "create_nequi_push") {
      throw new Error("Acción '" + action + "' no reconocida");
    }

    const amount = validateAmount(payload?.amount);
    const cellphone = validateCellphone(payload?.cellphone);
    const concept = payload?.concept ? sanitize(payload.concept, 100) : "Cobro Nequi Push";
    const virtualKey = payload?.virtual_key ? sanitize(payload.virtual_key, 30) : null;

    const businessId = Deno.env.get("BEPAY_NEQUI_BUSINESS_ID") ?? "430231";
    const confirmUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/bepay-nequi-webhook";

    const token = await getBepayToken();

    const res = await fetch(BEMOVIL_BASE + "/transactions/buy", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        data: {
          businessId,
          amount: String(amount),
          paymentMethod: "nequipush",
          cellphone,
          confirmUrl,
        },
      }),
    });
    const bemovilResult = await res.json();

    const ide = extractTransactionIde(bemovilResult.data);

    if (bemovilResult.success && ide) {
      await adminClient.from("bepay_transactions").insert({
        user_id: user.id,
        bepay_ide: ide,
        type: "charge",
        amount,
        concept,
        status: "PENDING",
        account_type: "NEQUI_PUSH",
        account_key: virtualKey,
        reference: "NEQUI-" + user.id.slice(0, 8) + "-" + Date.now(),
        tarifa_aplicada: profile.tarifa_recibir,
        tarifa_variable: profile.tarifa_variable,
        comision_total: profile.tarifa_recibir,
        raw_response: bemovilResult.data,
      });

      await adminClient.from("audit_log").insert({
        user_id: user.id,
        action: "CREATE_NEQUI_PUSH",
        entity: "bepay_transaction",
        entity_id: ide,
        metadata: { amount, cellphone, concept },
      });
    }

    return new Response(JSON.stringify(bemovilResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[bepay-nequi-push]", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});