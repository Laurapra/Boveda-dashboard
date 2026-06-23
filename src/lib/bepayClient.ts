import { supabase } from "./supabase";

// Llama a una Edge Function de Supabase que habla con Bepay
async function callBepay(fn: string, action: string, payload: object) {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { action, payload },
  });
  if (error) throw new Error(error.message);
  if (!data.success && data.error) throw new Error(data.error);
  return data;
}

// ── Cobros ────────────────────────────────────────────────────────

// Crea un link de pago real en Bepay
export async function createPaymentLink(amount: number, concept: string) {
  return callBepay("bepay-charges", "create_link", { amount, concept });
  // Retorna: { success, data: { ide, total, link, qr } }
}

// Crea un QR de cobro
export async function createPaymentQR(amount: number, concept: string) {
  return callBepay("bepay-charges", "create_qr", { amount, concept });
}

// Envía cobro por WhatsApp
export async function sendWhatsAppCharge(amount: number, concept: string, phone: string) {
  return callBepay("bepay-charges", "send_whatsapp", { amount, concept, phone });
}

// Consulta el estado de una transacción
export async function getTransactionStatus(ide: string) {
  return callBepay("bepay-charges", "transaction_status", { ide });
}

// ── Dispersiones ─────────────────────────────────────────────────

// Consulta el titular de una llave Bre-B (valida antes de dispersar)
export async function lookupBrebKey(key: string) {
  return callBepay("bepay-payouts", "lookup_key", { key });
  // Retorna: { success, data: { key, name, bank, account_type } }
}

// Dispersión por Bre-B
export async function sendPayoutBreb(
  key: string, amount: number, concept: string, reference: string
) {
  return callBepay("bepay-payouts", "payout_breb", { key, amount, concept, reference });
}

// Dispersión ACH (cuenta bancaria)
export async function sendPayoutAch(payload: {
  bank_code: string;
  account_number: string;
  account_type: "ahorros" | "corriente";
  document_type: string;
  document_number: string;
  holder_name: string;
  amount: number;
  concept: string;
  reference: string;
}) {
  return callBepay("bepay-payouts", "payout_ach", payload);
}

// Consulta estado de una dispersión
export async function getPayoutStatus(payoutId: string) {
  return callBepay("bepay-payouts", "payout_status", { payout_id: payoutId });
}