// supabase/functions/bepay-charges/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BEPAY_BASE = "https://app.bepay.com.co/api/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Obtiene un token de acceso de Bepay
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
  return json.data; // el token
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, payload } = await req.json();
    const token = await getBepayToken();
    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    let result;

    switch (action) {

      // ── Crear link de cobro ────────────────────────────────────
      case "create_link": {
        const res = await fetch(`${BEPAY_BASE}/charges/link`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            account_id:   accountId,
            total:        payload.amount,       
            description:  payload.concept,      
            redirect_url: payload.redirect_url ?? "https://boveda-dashboard.vercel.app",
          }),
        });
        result = await res.json();
        break;
      }

      // ── Crear QR de cobro ──────────────────────────────────────
      case "create_qr": {
        const res = await fetch(`${BEPAY_BASE}/charges/qr`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            account_id:  accountId,
            total:       payload.amount,
            description: payload.concept,
          }),
        });
        result = await res.json();
        break;
      }

      // ── Enviar cobro por WhatsApp ──────────────────────────────
      case "send_whatsapp": {
        const res = await fetch(`${BEPAY_BASE}/charges/whatsapp`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            account_id:  accountId,
            total:       payload.amount,
            description: payload.concept,
            phone:       payload.phone, // número colombiano ej: 3001234567
          }),
        });
        result = await res.json();
        break;
      }

      // ── Estado de una transacción ──────────────────────────────
      case "transaction_status": {
        const res = await fetch(
          `${BEPAY_BASE}/checkout/transactionStatus?ide=${payload.ide}&account_id=${accountId}`,
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