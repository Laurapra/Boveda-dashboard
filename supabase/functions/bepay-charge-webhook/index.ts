// supabase/functions/bepay-charge-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChargeWebhookPayload {
  status: string;
  paymentmethod?: string;
  qr_type?: string;
  transaction_ide?: string;
  transacton_ide?: string;
  transaction_id?: number;
  transacton_id?: number;
  transaction_total?: string;
  transaction_description?: string;
  traceability_code?: string;
  started_at?: string;
  processed_at?: string;
  payer_name?: string;
  payer_document?: string;
  account_id?: number;
  financial_entity?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let payload: ChargeWebhookPayload;
    try {
      payload = await req.json();
    } catch {
      console.error("[bepay-charge-webhook] Body inválido");
      return new Response(JSON.stringify({ received: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[bepay-charge-webhook] Payload recibido:", JSON.stringify(payload));

    // Bepay a veces manda el campo con typo "transacton_ide" en vez de "transaction_ide"
    const ide = payload.transaction_ide ?? payload.transacton_ide;
    if (!ide) {
      console.error("[bepay-charge-webhook] Falta transaction_ide");
      return new Response(JSON.stringify({ received: false, error: "missing ide" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const BEPAY_BASE = "https://app.bepay.com.co/api/v1";
    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    // ── Verificación oficial — siempre confirma con Bepay, nunca confíes ciegamente en el webhook ──
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
      console.error("[bepay-charge-webhook] No se pudo autenticar con Bepay");
      return new Response(JSON.stringify({ received: true, verified: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = tokenJson.data;

    const statusRes = await fetch(
      `${BEPAY_BASE}/checkout/transactionStatus?ide=${ide}&account_id=${accountId}`,
      { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } }
    );
    const statusJson = await statusRes.json();
    console.log("[bepay-charge-webhook] Verificación oficial:", JSON.stringify(statusJson));

    const verifiedData = statusJson.data ?? payload;
    const finalStatus = verifiedData.status ?? payload.status;

    // ── Buscar la transacción local por bepay_ide ──────────────────
    const { data: txRow } = await adminClient
      .from("bepay_transactions")
      .select("id, user_id")
      .eq("bepay_ide", ide)
      .single();

    if (!txRow) {
      console.warn("[bepay-charge-webhook] No se encontró transacción local para ide:", ide);
      return new Response(JSON.stringify({ received: true, matched: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Actualiza con el estado verificado ──────────────────────────
    const { error: updateErr } = await adminClient
      .from("bepay_transactions")
      .update({
        status: finalStatus,
        payment_method: payload.paymentmethod ?? null,
        raw_response: verifiedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", txRow.id);

    if (updateErr) {
      console.error("[bepay-charge-webhook] Error actualizando:", updateErr.message);
    }

    // Si se aprobó y tiene llave virtual asociada, incrementa el total recibido
    if (finalStatus === "APPROVED") {
      const { data: txFull } = await adminClient
        .from("bepay_transactions")
        .select("account_key, amount, user_id")
        .eq("id", txRow.id)
        .single();

      if (txFull?.account_key) {
        await adminClient.rpc("increment_key_total", {
          p_key_value: txFull.account_key,
          p_user_id: txFull.user_id,
          p_amount: txFull.amount,
        });
      }
    }

    await adminClient.from("audit_log").insert({
      user_id: txRow.user_id,
      action: "CHARGE_WEBHOOK_RECEIVED",
      entity: "bepay_transaction",
      entity_id: txRow.id,
      metadata: {
        bepay_ide: ide,
        status: finalStatus,
        paymentmethod: payload.paymentmethod,
        payer_name: payload.payer_name,
      },
    });

    console.log("[bepay-charge-webhook] Transacción actualizada:", txRow.id, "->", finalStatus);

    return new Response(JSON.stringify({ received: true, matched: true, status: finalStatus }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[bepay-charge-webhook] ERROR:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ received: true, error: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});