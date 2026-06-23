// supabase/functions/bepay-payouts/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  if (!json.success) throw new Error(`Bepay auth error: ${json.message}`);
  return json.data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, payload } = await req.json();
    const token     = await getBepayToken();
    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    let result;

    switch (action) {

      // ── Consultar titular de una llave Bre-B ───────────────────
      case "lookup_key": {
        const res = await fetch(
          `${BEPAY_BASE}/payout/get/${encodeURIComponent(payload.key)}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept": "application/json",
            },
          }
        );
        result = await res.json();
        break;
      }

      // ── Dispersión Bre-B ───────────────────────────────────────
      case "payout_breb": {
        const res = await fetch(`${BEPAY_BASE}/payout/breb/send`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            account_id:  accountId,
            key:         payload.key,        // llave Bre-B destino
            amount:      payload.amount,     // monto COP
            description: payload.concept,
            reference:   payload.reference,
          }),
        });
        result = await res.json();
        break;
      }

      // ── Dispersión ACH (cuenta bancaria tradicional) ───────────
      case "payout_ach": {
        const res = await fetch(`${BEPAY_BASE}/payout/ach/send`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            account_id:      accountId,
            bank_code:       payload.bank_code,
            account_number:  payload.account_number,
            account_type:    payload.account_type,  // "ahorros" | "corriente"
            document_type:   payload.document_type,
            document_number: payload.document_number,
            name:            payload.holder_name,
            amount:          payload.amount,
            description:     payload.concept,
            reference:       payload.reference,
          }),
        });
        result = await res.json();
        break;
      }

      // ── Consultar estado de una dispersión ─────────────────────
      case "payout_status": {
        const res = await fetch(
          `${BEPAY_BASE}/payout/status/${payload.payout_id}/${accountId}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept": "application/json",
            },
          }
        );
        result = await res.json();
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Acción no reconocida" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});