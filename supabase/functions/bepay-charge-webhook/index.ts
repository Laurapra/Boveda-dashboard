// supabase/functions/bepay-charge-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditBalance } from "../_shared/balance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Confirmado con un pago real a llave Bre-b (3 ago 2026, ide
// 05364730-17f6-4d0d-aa23-510efac479ea, ver detalles completos abajo).
interface ChargeWebhookPayload {
  status: string;
  paymentmethod?: string; // "MOVII_BREB_KEY" para pagos directos a la llave
  qr_type?: string;
  transaction_ide?: string;
  transacton_ide?: string;
  transaction_id?: number;
  transacton_id?: number;
  transaction_total?: string;
  transaction_description?: string;
  transaction_extra2?: string; // trae la "reference" (ej. "ramplix061")
  traceability_code?: string;
  started_at?: string;
  processed_at?: string;
  payer_name?: string;
  payer_document?: string;
  account_id?: number;
  financial_entity?: string;
  // Para pagos MOVII_BREB_KEY, checkout/transactionStatus responde "Invalid
  // transaction token" (ese endpoint es solo para transacciones de checkout
  // link/QR) — el detalle real, incluida la llave receptora, viene aquí
  // mismo en el webhook, no en la verificación.
  details?: {
    data?: {
      Creditor?: {
        PartyIdentifier?: string; // ej. "@beramplix010" — la llave real que recibió el pago
        PartyAlias?: string;      // ej. "BE STIFF CARRILLO"
      };
      GlobalTransactionInfAndSts?: {
        GlobalTxStatus?: string; // "ACCP" = aceptada
      };
    };
  };
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

    // OJO: statusJson.data puede venir como [] (array vacío) cuando el ide
    // no aplica para este endpoint (ej. pagos MOVII_BREB_KEY responden
    // "Invalid transaction token" con data:[]). "[] ?? payload" NO cae al
    // fallback porque [] no es null/undefined — hay que revisar explícito.
    const hasValidStatusData = statusJson?.success === true && statusJson?.data && !Array.isArray(statusJson.data);
    const verifiedData = hasValidStatusData ? statusJson.data : payload;
    const finalStatus = verifiedData.status ?? payload.status;
    // Preferimos el dato verificado (transactionStatus) si viene, si no el
    // que mandó el webhook directamente.
    const payerName = verifiedData.payer_name ?? payload.payer_name ?? null;
    const payerDocument = verifiedData.payer_document ?? payload.payer_document ?? null;

    // ── Buscar la transacción local por bepay_ide ──────────────────
    let { data: txRow } = await adminClient
      .from("bepay_transactions")
      .select("id, user_id")
      .eq("bepay_ide", ide)
      .single();

    // Si esta llamada gana la carrera para insertar la fila (o para
    // transicionarla de no-APPROVED a APPROVED), es la única que debe
    // abonar el saldo y sumar al total_received de la llave — se decide más
    // abajo, nunca leyendo un status "de antes" (eso es lo que permitía que
    // dos entregas concurrentes del mismo webhook abonaran dos veces).
    let creditEligible = false;
    let isNewRow = false;

    if (!txRow) {
      // No existe fila local — esto pasa cuando alguien transfiere DIRECTO
      // a la llave Bre-b desde su banco (Nequi, Nu, etc.), sin pasar por un
      // link/QR generado por nosotros (que sí crea la fila de antemano en
      // create_link/create_qr). Antes esto se descartaba silenciosamente —
      // el dinero llegaba en Bepay pero el movimiento nunca aparecía en
      // "Mis billeteras". Ahora se busca a qué llave/usuario pertenece y se
      // crea la fila aquí mismo.
      console.warn("[bepay-charge-webhook] No hay transacción local para ide:", ide, "- intentando crear una nueva a partir de la llave receptora");

      // Confirmado con un caso real: la llave receptora viene en
      // details.data.Creditor.PartyIdentifier (ej. "@beramplix010").
      const candidateKey =
        payload.details?.data?.Creditor?.PartyIdentifier ??
        verifiedData.details?.data?.Creditor?.PartyIdentifier ??
        null;

      let matchedKey: { key_value: string; user_id: string } | null = null;
      if (candidateKey) {
        const plain = String(candidateKey).replace(/^@/, "");
        const { data: keyRow } = await adminClient
          .from("breb_keys")
          .select("key_value, user_id")
          .or(`key_value.eq.${plain},key_value.eq.@${plain}`)
          .limit(1)
          .maybeSingle();
        matchedKey = keyRow ?? null;
      }

      if (!matchedKey) {
        console.error(
          "[bepay-charge-webhook] No se pudo determinar la llave/usuario receptor para ide:", ide,
          "- candidateKey probado:", candidateKey,
          "- revisar el payload completo en el log anterior para ubicar el campo correcto"
        );
        return new Response(JSON.stringify({ received: true, matched: false, reason: "no_local_row_and_no_key_match" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const amount = Number(verifiedData.transaction_total ?? payload.transaction_total ?? 0);

      // Misma comisión fija que usa create_link/create_qr — sin esto, los
      // recaudos que llegan DIRECTO a la llave (sin pasar por un link/QR
      // generado por nosotros) quedaban con comision_total en null: el saldo
      // sí se abonaba neto más abajo, pero la columna "Comisión" salía vacía
      // en Mis billeteras/Estado de Cuenta y el monto se veía como si no se
      // hubiera descontado nada.
      const { data: recvProfile } = await adminClient
        .from("profiles")
        .select("tarifa_recibir")
        .eq("id", matchedKey.user_id)
        .single();
      const comisionRecaudo = recvProfile?.tarifa_recibir ?? 1190;

      const { data: inserted, error: insertErr } = await adminClient
        .from("bepay_transactions")
        .insert({
          user_id: matchedKey.user_id,
          bepay_ide: ide,
          type: "charge",
          amount,
          concept: verifiedData.transaction_description ?? payload.transaction_description ?? "Recaudo Bre-b",
          status: finalStatus,
          account_key: matchedKey.key_value,
          payment_method: payload.paymentmethod ?? "breb",
          payer_name: payerName,
          payer_document: payerDocument,
          tarifa_aplicada: comisionRecaudo,
          comision_total: comisionRecaudo,
          raw_response: verifiedData,
        })
        .select("id, user_id")
        .single();

      if (insertErr) {
        // 23505 = choque con la restricción UNIQUE(bepay_ide, type) — otra
        // entrega concurrente del mismo webhook ya insertó esta fila
        // primero (dos pagos directos a la llave casi simultáneos para el
        // mismo ide). En vez de fallar, se recupera esa fila y se sigue
        // igual que si ya hubiera existido desde el principio — así ninguna
        // de las dos entregas se pierde el abono si el estado cambió entre
        // ambas verificaciones, pero tampoco se duplica.
        if (insertErr.code === "23505") {
          const { data: existing } = await adminClient
            .from("bepay_transactions")
            .select("id, user_id")
            .eq("bepay_ide", ide)
            .eq("type", "charge")
            .single();
          if (!existing) {
            console.error("[bepay-charge-webhook] Conflicto de inserción pero no se encontró la fila para ide:", ide);
            return new Response(JSON.stringify({ received: true, matched: false, error: "insert_conflict_not_found" }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          txRow = existing;
        } else {
          console.error("[bepay-charge-webhook] Error creando transacción nueva:", insertErr.message);
          return new Response(JSON.stringify({ received: true, matched: false, error: insertErr.message }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        txRow = inserted;
        isNewRow = true;
        // Insert fresco — como el UNIQUE(bepay_ide, type) garantiza que solo
        // una entrega puede haber ganado esta inserción, esta es
        // automáticamente la única que debe abonar si quedó APPROVED.
        creditEligible = finalStatus === "APPROVED";
      }
    }

    if (!isNewRow) {
      // Fila ya existía de antes, o se acaba de recuperar tras un conflicto
      // de inserción — actualiza los campos descriptivos siempre (no mueven
      // dinero, no hay riesgo de carrera en pisarlos varias veces).
      await adminClient
        .from("bepay_transactions")
        .update({
          payment_method: payload.paymentmethod ?? null,
          payer_name: payerName,
          payer_document: payerDocument,
          raw_response: verifiedData,
          updated_at: new Date().toISOString(),
          ...(finalStatus !== "APPROVED" ? { status: finalStatus } : {}),
        })
        .eq("id", txRow.id);

      if (finalStatus === "APPROVED") {
        // Transición atómica y condicional — como mucho una llamada
        // concurrente logra pasar el status de no-APPROVED a APPROVED aquí;
        // esa es la única que abona. Reemplaza el chequeo de "status
        // anterior" leído por separado, que era la causa real de que dos
        // entregas del webhook (o el webhook corriendo junto con una
        // sincronización) pudieran abonar el mismo recaudo dos veces.
        const { data: won } = await adminClient
          .from("bepay_transactions")
          .update({ status: "APPROVED" })
          .eq("id", txRow.id)
          .neq("status", "APPROVED")
          .select("id");
        creditEligible = !!(won && won.length > 0);
      }
    }

    // Si se aprobó Y esta llamada ganó la transición, incrementa el total
    // recibido de la llave y abona el saldo — nunca dos veces para el mismo
    // recaudo, sin importar cuántas entregas duplicadas lleguen.
    if (finalStatus === "APPROVED" && creditEligible) {
      const { data: txFull } = await adminClient
        .from("bepay_transactions")
        .select("account_key, amount, user_id, comision_total, type")
        .eq("id", txRow.id)
        .single();

      if (txFull?.account_key) {
        await adminClient.rpc("increment_key_total", {
          p_key_value: txFull.account_key,
          p_user_id: txFull.user_id,
          p_amount: txFull.amount,
        });
      }

      // ── Abonar el neto (monto - comisión) al saldo del cliente ────────
      // creditEligible ya garantizó (de forma atómica) que esta es la única
      // llamada que ganó la transición a APPROVED para este recaudo — un
      // webhook duplicado o un reintento de Bepay ya no puede abonar dos
      // veces la misma transacción. Ej: recauda $10.000, comisión $1.190 ->
      // se abonan $8.810.
      if (txFull && txFull.type === "charge") {
        let comision = txFull.comision_total;
        if (comision === null || comision === undefined) {
          // Cobros que llegaron directo a la llave (sin pasar por
          // create_link) no traen comision_total guardado — se usa la
          // tarifa vigente del usuario como respaldo.
          const { data: prof } = await adminClient
            .from("profiles")
            .select("tarifa_recibir")
            .eq("id", txFull.user_id)
            .single();
          comision = prof?.tarifa_recibir ?? 1190;
        }
        const neto = Math.max(0, Number(txFull.amount) - Number(comision));
        if (neto > 0) {
          await creditBalance(adminClient, txFull.user_id, neto);
          await adminClient.from("audit_log").insert({
            user_id: txFull.user_id,
            action: "CHARGE_BALANCE_CREDIT",
            entity: "bepay_transaction",
            entity_id: txRow.id,
            metadata: { amount: txFull.amount, comision, neto },
          });
        }
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
        payer_name: payerName,
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