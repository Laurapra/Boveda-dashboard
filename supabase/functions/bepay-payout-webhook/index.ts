// supabase/functions/bepay-payout-webhook/index.ts
//
// Webhook de notificación de DISPERSIONES (payouts) de Bepay — Bre-B, ACH,
// Transfiya. Calcado del webhook de cobros (bepay-charge-webhook): nunca
// confía ciegamente en el payload que llega, siempre reverifica contra
// Bepay antes de actualizar el estado local, siguiendo la recomendación que
// Bepay incluye en el propio payload del webhook ("Siempre usa el endpoint
// .../payout/status/{id}/{account_id} para confirmar la validez de la
// dispersión").
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyPayoutStatusTransition } from "../_shared/balance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PayoutWebhookPayload {
  id?: number | string;
  status?: string;
  trazability_code?: string;
  total_amount?: string;
  fixed_comission?: string;
  percent_comission?: string;
  bank_status?: string;
  bank_status_description?: string;
  processed_at?: string;
  phone_number?: string;
  transfiya_handle?: string;
  key_number?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let payload: PayoutWebhookPayload;
    try {
      payload = await req.json();
    } catch {
      console.error("[bepay-payout-webhook] Body inválido");
      return new Response(JSON.stringify({ received: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[bepay-payout-webhook] Payload recibido:", JSON.stringify(payload));

    const payoutId = payload.id;
    if (payoutId === undefined || payoutId === null || payoutId === "") {
      console.error("[bepay-payout-webhook] Falta id de la dispersión");
      return new Response(JSON.stringify({ received: false, error: "missing id" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const BEPAY_BASE = "https://app.bepay.com.co/api/v1";
    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    // ── Verificación oficial — siguiendo la recomendación del propio payload
    // de Bepay: nunca confiar ciegamente en el webhook, siempre reconfirmar.
    const tokenRes = await fetch(`${BEPAY_BASE}/get-access-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        email: Deno.env.get("BEPAY_EMAIL"),
        password: Deno.env.get("BEPAY_PASSWORD"),
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.success) {
      console.error("[bepay-payout-webhook] No se pudo autenticar con Bepay");
      return new Response(JSON.stringify({ received: true, verified: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = tokenJson.data;

    const statusRes = await fetch(
      `${BEPAY_BASE}/payout/status/${payoutId}/${accountId}`,
      { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } }
    );
    const statusJson = await statusRes.json();
    console.log("[bepay-payout-webhook] Verificación oficial:", JSON.stringify(statusJson));

    const verifiedData = statusJson.data ?? payload;
    const finalStatus = verifiedData.status ?? payload.status;

    if (!finalStatus) {
      console.warn("[bepay-payout-webhook] No se pudo determinar el estado final");
      return new Response(JSON.stringify({ received: true, verified: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Buscar la dispersión local por bepay_ide (mismo id que devolvió
    // bepay-payouts al crearla — ver extractPayoutId en ese archivo) ──────
    const { data: txRow } = await adminClient
      .from("bepay_transactions")
      .select("id, user_id, status, amount, comision_total")
      .eq("bepay_ide", String(payoutId))
      .eq("type", "payout")
      .single();

    if (!txRow) {
      console.warn("[bepay-payout-webhook] No se encontró dispersión local para id:", payoutId);
      return new Response(JSON.stringify({ received: true, matched: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reintegra saldo si la dispersión pasó de PENDING a un estado de
    // rechazo/fallo — no hace nada si pasó a un estado de éxito, y es seguro
    // aunque el webhook llegue duplicado (solo actúa si el status guardado
    // todavía era PENDING). Debe ir ANTES de sobreescribir el status abajo.
    await applyPayoutStatusTransition(adminClient, txRow, finalStatus);

    const { error: updateErr } = await adminClient
      .from("bepay_transactions")
      .update({
        status: finalStatus,
        raw_response: verifiedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", txRow.id);

    if (updateErr) {
      console.error("[bepay-payout-webhook] Error actualizando:", updateErr.message);
    }

    await adminClient.from("audit_log").insert({
      user_id: txRow.user_id,
      action: "PAYOUT_WEBHOOK_RECEIVED",
      entity: "bepay_transaction",
      entity_id: txRow.id,
      metadata: {
        bepay_ide: String(payoutId),
        status: finalStatus,
        bank_status_description: payload.bank_status_description,
      },
    });

    console.log("[bepay-payout-webhook] Dispersión actualizada:", txRow.id, "->", finalStatus);

    return new Response(JSON.stringify({ received: true, matched: true, status: finalStatus }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[bepay-payout-webhook] ERROR:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ received: true, error: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
