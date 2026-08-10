// supabase/functions/bepay-payouts/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitBalanceIfSufficient, creditBalance, applyPayoutStatusTransition, getHouseAdminId } from "../_shared/balance.ts";

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

// Bepay responde los endpoints de payout como batch: `data` puede venir como
// array (uno por cada payout enviado) o como objeto único. Este helper extrae
// el ID/IDE real que Bepay asignó, sin importar la forma de la respuesta.
function extractPayoutId(data: unknown): string | null {
  if (!data) return null;
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || typeof first !== "object") return null;
  const obj = first as Record<string, unknown>;
  const raw = obj.ide ?? obj.id ?? obj.payout_id ?? obj.transaction_id;
  if (raw === undefined || raw === null || raw === "") return null;
  return String(raw);
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

// Acredita la comisión variable (nuestro margen, no lo que cobra Bepay) al
// saldo de la cuenta admin ("casa") apenas una dispersión queda en curso en
// Bepay (PENDING) — así se va acumulando ahí para poder retirarla después.
// Si la dispersión se termina rechazando, applyPayoutStatusTransition la
// revierte (ver _shared/balance.ts). Nunca bloquea ni revierte la
// dispersión del cliente si esto falla — es solo contabilidad interna.
async function creditHouseCommission(
  adminClient: ReturnType<typeof createClient>,
  entityId: string,
  dispersionUserId: string,
  comisionVariable: number
): Promise<void> {
  if (comisionVariable <= 0) return;
  try {
    const houseId = await getHouseAdminId(adminClient);
    if (!houseId) {
      console.error("[creditHouseCommission] No se encontró ninguna cuenta admin — no se acreditó la comisión");
      return;
    }
    await creditBalance(adminClient, houseId, comisionVariable);
    await adminClient.from("audit_log").insert({
      user_id: houseId,
      action: "HOUSE_COMMISSION_CREDIT",
      entity: "bepay_transaction",
      entity_id: entityId,
      metadata: { comision_variable: comisionVariable, dispersion_user_id: dispersionUserId },
    });
  } catch (err) {
    console.error("[creditHouseCommission] Error acreditando comisión a la casa:", err instanceof Error ? err.message : String(err));
  }
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
        // Banco real identificado por la API al verificar la llave (lookup_key),
        // enviado desde el frontend. Si no viene, se guarda null en vez de un texto fijo.
        const bankName = payload?.bank_name ? sanitize(payload.bank_name, 60) : null;
        const benName = payload?.ben_name ? sanitize(payload.ben_name, 100) : null;
        const benDocType = payload?.ben_doc_type ? sanitize(payload.ben_doc_type, 10) : null;
        const benDocNumber = payload?.ben_doc_number ? sanitize(payload.ben_doc_number, 20) : null;

        const comisionFija = profile.tarifa_enviar ?? 1190;
        const comisionVariable = Math.round(amount * (profile.tarifa_variable ?? 0.0012));
        const comisionTotal = comisionFija + comisionVariable;
        const totalADebitar = amount + comisionTotal;
        const reference = payload?.reference ? sanitize(payload.reference, 100) : "DISP-" + user.id.slice(0, 8) + "-" + Date.now();

        // ── Verificar y descontar saldo ANTES de enviar nada a Bepay — si no
        // alcanza, la operación se bloquea aquí mismo y nunca llega a Bepay.
        // El débito es atómico (ver debitBalanceIfSufficient): si el saldo no
        // alcanza, devuelve null y no se descontó nada.
        const balanceAfterDebit = await debitBalanceIfSufficient(adminClient, user.id, totalADebitar);
        if (balanceAfterDebit === null) {
          const { data: profBal } = await adminClient.from("profiles").select("balance").eq("id", user.id).single();
          const saldoDisponible = Number(profBal?.balance ?? 0);
          throw new Error(
            `Fondos insuficientes — el total a debitar es $${totalADebitar.toLocaleString("es-CO")} y tu saldo disponible es $${saldoDisponible.toLocaleString("es-CO")}.`
          );
        }

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

        // Bepay rechazó de plano la dispersión (nunca quedó PENDING) — se
        // reintegra de inmediato lo que se descontó arriba.
        if (!bepayResult.success) {
          await creditBalance(adminClient, user.id, totalADebitar);
        }

        const { data: txRow } = await adminClient.from("bepay_transactions").insert({
          user_id: user.id,
          bepay_ide: extractPayoutId(bepayResult.data) ?? reference,
          type: "payout",
          amount,
          concept,
          status: bepayResult.success ? "PENDING" : "FAILED",
          ben_name: benName,
          ben_doc_type: benDocType,
          ben_doc_number: benDocNumber,
          account_type: "Bre-B",
          account_key: key,
          bank_name: bankName,
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
          metadata: { amount, key, concept, bank_name: bankName, success: bepayResult.success, comision_total: comisionTotal },
        });

        // Solo si la dispersión quedó realmente en curso en Bepay — si
        // bepayResult.success es false ya se reintegró todo al cliente
        // arriba, así que no hay comisión que acreditarle a la casa.
        if (bepayResult.success) {
          await creditHouseCommission(adminClient, (txRow && txRow.id) || reference, user.id, comisionVariable);
        }

        result = bepayResult;
        break;
      }

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
        const totalADebitar = amount + comisionTotal;
        const reference = payload?.reference ? sanitize(payload.reference, 100) : "ACH-" + user.id.slice(0, 8) + "-" + Date.now();

        // ── Igual que en payout_breb: bloquear aquí si no alcanza el saldo,
        // antes de tocar a Bepay para nada.
        const balanceAfterDebit = await debitBalanceIfSufficient(adminClient, user.id, totalADebitar);
        if (balanceAfterDebit === null) {
          const { data: profBal } = await adminClient.from("profiles").select("balance").eq("id", user.id).single();
          const saldoDisponible = Number(profBal?.balance ?? 0);
          throw new Error(
            `Fondos insuficientes — el total a debitar es $${totalADebitar.toLocaleString("es-CO")} y tu saldo disponible es $${saldoDisponible.toLocaleString("es-CO")}.`
          );
        }

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

        if (!bepayResult.success) {
          await creditBalance(adminClient, user.id, totalADebitar);
        }

        await adminClient.from("bepay_transactions").insert({
          user_id: user.id,
          bepay_ide: extractPayoutId(bepayResult.data) ?? reference,
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

        if (bepayResult.success) {
          await creditHouseCommission(adminClient, reference, user.id, comisionVariable);
        }

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
          const { data: txRow } = await adminClient
            .from("bepay_transactions")
            .select("id, user_id, amount, comision_total, tarifa_aplicada")
            .eq("bepay_ide", payoutId)
            .eq("type", "payout")
            .maybeSingle();

          if (txRow) {
            // Escribe el status y reintegra saldo si aplica — todo dentro de
            // applyPayoutStatusTransition, de forma atómica (ver comentario
            // en _shared/balance.ts).
            await applyPayoutStatusTransition(adminClient, txRow, statusResult.data.status);
          }
        }
        result = statusResult;
        break;
      }

      // ── Sincronizar MIS dispersiones pendientes (cualquier usuario) ──
      // sync_pending_payouts (abajo) es solo para el admin y solo se dispara
      // con el botón manual "Sincronizar" en el panel. Un usuario normal
      // nunca lo ve, así que sus dispersiones se quedaban en PENDING para
      // siempre aunque ya hubieran quedado completadas o rechazadas en
      // Bepay — nada más las refrescaba. Esta versión, scoped a user_id,
      // se llama automáticamente cada vez que el cliente abre Mis billeteras,
      // Estado de Cuenta o Inicio, para que su propio estado se ponga al día
      // sin depender de que un admin sincronice manualmente.
      case "sync_my_payouts": {
        const { data: myPending } = await adminClient
          .from("bepay_transactions")
          .select("id, bepay_ide, user_id, amount, comision_total, tarifa_aplicada")
          .eq("type", "payout")
          .eq("status", "PENDING")
          .eq("user_id", user.id)
          .limit(50);

        let updated = 0;
        let checked = 0;

        for (const tx of myPending ?? []) {
          if (!tx.bepay_ide) continue;
          checked++;

          try {
            const res = await fetch(
              BEPAY_BASE + "/payout/status/" + tx.bepay_ide + "/" + accountId,
              { headers: { "Authorization": "Bearer " + token, "Accept": "application/json" } }
            );
            const statusJson = await res.json();

            if (statusJson.data && statusJson.data.status && statusJson.data.status !== "PENDING") {
              // Escribe el status y reintegra si aplica — atómico, ver
              // _shared/balance.ts.
              await applyPayoutStatusTransition(adminClient, tx, statusJson.data.status);
              updated++;
            }
          } catch {
            // Continúa con la siguiente aunque una falle
          }
        }

        result = { success: true, checked, updated };
        break;
      }

      // ── Sincronizar dispersiones pendientes con el estado real de Bepay ──
      case "sync_pending_payouts": {
        if (profile.role !== "admin") throw new Error("No autorizado");

        const { data: pending } = await adminClient
          .from("bepay_transactions")
          .select("id, bepay_ide, user_id, amount, comision_total, tarifa_aplicada")
          .eq("type", "payout")
          .eq("status", "PENDING")
          .limit(50);

        let updated = 0;
        let checked = 0;

        for (const tx of pending ?? []) {
          if (!tx.bepay_ide) continue;
          checked++;

          try {
            const res = await fetch(
              BEPAY_BASE + "/payout/status/" + tx.bepay_ide + "/" + accountId,
              { headers: { "Authorization": "Bearer " + token, "Accept": "application/json" } }
            );
            const statusJson = await res.json();

            if (statusJson.data && statusJson.data.status && statusJson.data.status !== "PENDING") {
              // Escribe el status y reintegra si aplica — atómico, ver
              // _shared/balance.ts.
              await applyPayoutStatusTransition(adminClient, tx, statusJson.data.status);
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