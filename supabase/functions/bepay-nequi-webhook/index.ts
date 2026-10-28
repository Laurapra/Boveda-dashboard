// supabase/functions/bepay-nequi-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BEPAY_BASE = "https://app.bepay.com.co/api/v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Este endpoint lo llama Bemovil/Bepay directamente — no requiere sesión de usuario.
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ received: false, error: "invalid body" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[bepay-nequi-webhook] Payload recibido:", JSON.stringify(payload));

    const ide = String(payload.ide ?? payload.id ?? payload.transaction_id ?? payload.transaction_ide ?? "");
    if (!ide) {
      return new Response(JSON.stringify({ received: false, error: "missing ide" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    // Verificación oficial contra el estado real — nunca confiamos ciegamente
    // en lo que trae el webhook crudo.
    const tokenRes = await fetch(BEPAY_BASE + "/get-access-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        email: Deno.env.get("BEPAY_EMAIL"),
        password: Deno.env.get("BEPAY_PASSWORD"),
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.success) {
      console.error("[bepay-nequi-webhook] No se pudo autenticar con Bepay");
      return new Response(JSON.stringify({ received: true, verified: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = tokenJson.data;

    const statusRes = await fetch(
      BEPAY_BASE + "/checkout/transactionStatus?Token=" + encodeURIComponent(ide) + "&account_id=" + accountId,
      { headers: { "Authorization": "Bearer " + token, "Accept": "application/json" } }
    );
    const statusJson = await statusRes.json();
    console.log("[bepay-nequi-webhook] Verificación oficial:", JSON.stringify(statusJson));

    const verifiedData = statusJson.data ?? payload;
    const finalStatus = verifiedData.status ?? payload.status;

    const { data: txRow } = await adminClient
      .from("bepay_transactions")
      .select("id, user_id, amount, account_key")
      .eq("bepay_ide", ide)
      .single();

    if (!txRow) {
      console.warn("[bepay-nequi-webhook] No se encontró transacción local para ide:", ide);
      return new Response(JSON.stringify({ received: true, matched: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient
      .from("bepay_transactions")
      .update({
        status: finalStatus,
        raw_response: verifiedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", txRow.id);

    if (finalStatus === "APPROVED" && txRow.account_key) {
      await adminClient.rpc("increment_key_total", {
        p_key_value: txRow.account_key,
        p_user_id: txRow.user_id,
        p_amount: txRow.amount,
      });
    }

    await adminClient.from("audit_log").insert({
      user_id: txRow.user_id,
      action: "NEQUI_PUSH_WEBHOOK_RECEIVED",
      entity: "bepay_transaction",
      entity_id: txRow.id,
      metadata: { ide, status: finalStatus },
    });

    return new Response(JSON.stringify({ received: true, matched: true, status: finalStatus }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[bepay-nequi-webhook]", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ received: true, error: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});