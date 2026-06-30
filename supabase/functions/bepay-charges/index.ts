// supabase/functions/bepay-charges/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BEPAY_BASE = "https://app.bepay.com.co/api/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getBepayToken(): Promise<string> {
  const email    = Deno.env.get("BEPAY_EMAIL");
  const password = Deno.env.get("BEPAY_PASSWORD");

  console.log("BEPAY_EMAIL:",    email    ? `✓ ${email}`  : "✗ VACÍO");
  console.log("BEPAY_PASSWORD:", password ? "✓ presente" : "✗ VACÍO");

  const res = await fetch(`${BEPAY_BASE}/get-access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const json = await res.json();
  console.log("Auth response:", JSON.stringify(json));

  if (!json.success) throw new Error(`Bepay auth error: ${json.message}`);
  return json.data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, payload } = body;

    console.log("Action recibido:", action);
    console.log("BEPAY_ACCOUNT_ID:", Deno.env.get("BEPAY_ACCOUNT_ID") ?? "✗ VACÍO");

    const token     = await getBepayToken();
    const accountId = Number(Deno.env.get("BEPAY_ACCOUNT_ID"));

    console.log("Token obtenido:", token ? "✓" : "✗ VACÍO");
    console.log("AccountId:", accountId);

    let result;

    switch (action) {

      // ── GENERALES ──────────────────────────────────────────────
      case "get_balance": {
        const res = await fetch(`${BEPAY_BASE}/account-balance`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({ account_id: accountId }),
        });
        result = await res.json();
        console.log("get_balance result:", JSON.stringify(result));
        break;
      }

      case "get_payment_methods": {
        const res = await fetch(`${BEPAY_BASE}/accounts/paymentmethods`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({ account_id: accountId }),
        });
        result = await res.json();
        break;
      }

      // ── COBROS ─────────────────────────────────────────────────
      case "create_link": {
        const res = await fetch(`${BEPAY_BASE}/charges/link`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({
            type:           "link",
            reference:      payload.reference ?? `BOV-${Date.now()}`,
            currency_code:  "COP",
            tax_percentage: 0,
            account_id:     accountId,
            total:          payload.amount,
            description:    payload.concept,
            redirect_url:   payload.redirect_url ?? "https://boveda-dashboard.vercel.app",
          }),
        });
        result = await res.json();
        console.log("create_link result:", JSON.stringify(result));
        break;
      }

      case "create_qr": {
        const res = await fetch(`${BEPAY_BASE}/charges/qr`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({
            type:           "qr",
            reference:      payload.reference ?? `BOV-${Date.now()}`,
            currency_code:  "COP",
            tax_percentage: 0,
            account_id:     accountId,
            total:          payload.amount,
            description:    payload.concept,
          }),
        });
        result = await res.json();
        break;
      }

      case "send_whatsapp": {
        const res = await fetch(`${BEPAY_BASE}/charges/whatsapp`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({
            type:           "whatsapp",
            reference:      payload.reference ?? `BOV-${Date.now()}`,
            currency_code:  "COP",
            tax_percentage: 0,
            account_id:     accountId,
            total:          payload.amount,
            description:    payload.concept,
            phone:          payload.phone,
          }),
        });
        result = await res.json();
        break;
      }

      case "send_email": {
        const res = await fetch(`${BEPAY_BASE}/charges/email`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({
            type:           "email",
            reference:      payload.reference ?? `BOV-${Date.now()}`,
            currency_code:  "COP",
            tax_percentage: 0,
            account_id:     accountId,
            total:          payload.amount,
            description:    payload.concept,
            email:          payload.email,
          }),
        });
        result = await res.json();
        break;
      }

      // ── TRANSACCIONES ──────────────────────────────────────────
      case "transaction_status": {
        const res = await fetch(
          `${BEPAY_BASE}/checkout/transactionStatus?ide=${payload.ide}&account_id=${accountId}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept":        "application/json",
            },
          }
        );
        result = await res.json();
        break;
      }

      case "list_transactions": {
        const by    = payload.by    ?? "account_id";
        const value = payload.value ?? accountId;
        const res = await fetch(
          `${BEPAY_BASE}/transactions/getTransactionsBy/${accountId}/${by}/${value}`,
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept":        "application/json",
            },
          }
        );
        result = await res.json();
        break;
      }

      case "cancel_transaction": {
        const res = await fetch(
          `${BEPAY_BASE}/transactions/disablePendingTransaction/${accountId}/${payload.ide}`,
          {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept":        "application/json",
            },
          }
        );
        result = await res.json();
        break;
      }

      // ── BRE-B ──────────────────────────────────────────────────

      // Registro Bre-B (onboarding único del comercio) — UN SOLO CASE
      case "breb_register": {
        const res = await fetch(`${BEPAY_BASE}/bre-b/register`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({
            account_id:           accountId,
            reference:            payload.reference ?? null,
            party_type:           "COMMERCE",
            mobile_number:        Number(payload.mobile_number),
            document_type:        payload.document_type,
            document_number:      payload.document_number,
            first_name:           payload.first_name,
            middle_name:          payload.middle_name ?? "",
            first_surname:        payload.first_surname,
            middle_surname:       payload.middle_surname ?? "",
            dane_code:            payload.dane_code,
            commerce_name:        payload.commerce_name,
            email:                payload.email,
            source:               "Web",
            gender:               payload.gender,
            address:              payload.address,
            birth_place:          payload.birth_place,
            dob:                  payload.dob,
            issue_date:           payload.issue_date,
            terms_and_conditions: true,
            use_wrapper:          "bepay",
            force:                payload.force ?? false,
          }),
        });
        result = await res.json();
        console.log("breb_register result:", JSON.stringify(result));
        break;
      }

      // Registrar una nueva llave Bre-B ← ESTE FALTABA
      case "register_breb_key": {
        const res = await fetch(`${BEPAY_BASE}/bre-b/key/register`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({
            account_id: accountId,
            reference:  payload.reference ?? "",
            key_value:  payload.key_value,
          }),
        });
        result = await res.json();
        console.log("register_breb_key result:", JSON.stringify(result));
        break;
      }

      case "get_breb_keys": {
        const res = await fetch(`${BEPAY_BASE}/bre-b/key/get`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({ account_id: accountId }),
        });
        result = await res.json();
        console.log("get_breb_keys result:", JSON.stringify(result));
        break;
      }

      case "breb_static_qr": {
        const res = await fetch(`${BEPAY_BASE}/bre-b/static-qr`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({
            account_id: accountId,
            key:        payload.key,
          }),
        });
        result = await res.json();
        break;
      }

      case "breb_dynamic_qr": {
        const res = await fetch(`${BEPAY_BASE}/bre-b/dynamic-qr`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body: JSON.stringify({
            account_id:  accountId,
            key:         payload.key,
            amount:      payload.amount,
            description: payload.concept,
            reference:   payload.reference ?? `BOV-${Date.now()}`,
          }),
        });
        result = await res.json();
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Acción '${action}' no reconocida` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[bepay-charges] ERROR:", err.message, err.stack);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});