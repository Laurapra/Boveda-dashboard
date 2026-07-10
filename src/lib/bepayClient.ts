// src/lib/bepayClient.ts
import { supabase } from "./supabase";

// ← Sin lanzar error para ver la respuesta completa de Bepay
async function callBepay(fn: string, action: string, payload: object) {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { action, payload },
  });
  if (error) throw new Error(error.message);
  return data; // devuelve todo, incluso errores de Bepay
}

// ── Generales ─────────────────────────────────────────────────────
export async function getBepayBalance() {
  return callBepay("bepay-charges", "get_balance", {});
}

export async function getPaymentMethods() {
  return callBepay("bepay-charges", "get_payment_methods", {});
}

// ── Cobros ────────────────────────────────────────────────────────
export async function createPaymentLink(amount: number, concept: string, redirectUrl?: string) {
  return callBepay("bepay-charges", "create_link", { amount, concept, redirect_url: redirectUrl });
}

export async function createPaymentQR(amount: number, concept: string) {
  return callBepay("bepay-charges", "create_qr", { amount, concept });
}

export async function sendWhatsAppCharge(amount: number, concept: string, phone: string) {
  return callBepay("bepay-charges", "send_whatsapp", { amount, concept, phone });
}

export async function sendEmailCharge(amount: number, concept: string, email: string) {
  return callBepay("bepay-charges", "send_email", { amount, concept, email });
}

// ── Transacciones ─────────────────────────────────────────────────
export async function getTransactionStatus(ide: string) {
  return callBepay("bepay-charges", "transaction_status", { ide });
}

export async function listTransactions(by?: string, value?: string | number) {
  return callBepay("bepay-charges", "list_transactions", { by, value });
}

export async function cancelTransaction(ide: string) {
  return callBepay("bepay-charges", "cancel_transaction", { ide });
}

// ── Bre-B ─────────────────────────────────────────────────────────
export async function registerBrebKey(reference: string, keyValue: string) {
  return callBepay("bepay-charges", "register_breb_key", { reference, key_value: keyValue });
}

export async function getBrebKeys() {
  return callBepay("bepay-charges", "get_breb_keys", {});
}

export async function getBrebStaticQr(key: string) {
  return callBepay("bepay-charges", "breb_static_qr", { key });
}

export async function getBrebDynamicQr(key: string, amount: number, concept: string) {
  return callBepay("bepay-charges", "breb_dynamic_qr", { key, amount, concept });
}

// ── Dispersiones ─────────────────────────────────────────────────
export async function lookupBrebKey(key: string) {
  return callBepay("bepay-payouts", "lookup_key", { key });
}

export async function sendPayoutBreb(
  key: string, amount: number, concept: string, reference: string
) {
  return callBepay("bepay-payouts", "payout_breb", { key, amount, concept, reference });
}

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

export async function getBankCodes() {
  return callBepay("bepay-payouts", "get_bank_codes", {});
}

export async function getPayoutStatus(payoutId: string) {
  return callBepay("bepay-payouts", "payout_status", { payout_id: payoutId });
}
// Agrega al final de src/lib/bepayClient.ts
export async function registerBrebAccount(payload: object) {
  return callBepay("bepay-charges", "breb_register", payload);
}
// Agrega al final de src/lib/bepayClient.ts
export async function registerBrebMerchant(payload: {
  reference?: string;
  mobile_number: string;
  document_type: string;
  document_number: string;
  first_name: string;
  middle_name?: string;
  first_surname: string;
  middle_surname?: string;
  dane_code: string;
  commerce_name: string;
  email: string;
  gender: "Masculino" | "Femenino";
  address: string;
  birth_place: string;
  dob: string;
  issue_date: string;
  force?: boolean;
}) {
  return callBepay("bepay-charges", "breb_register", payload);
}
// src/lib/bepayClient.ts — agrega al final

// ── Onboarding ────────────────────────────────────────────────────
async function callOnboarding(action: string, payload: object) {
  const { data, error } = await supabase.functions.invoke("onboarding", {
    body: { action, payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function submitOnboardingPN(payload: object) {
  return callOnboarding("submit_pn", payload);
}

export async function submitOnboardingEmp(payload: object) {
  return callOnboarding("submit_emp", payload);
}

export async function getOnboardingStatus() {
  return callOnboarding("get_status", {});
}

export async function getOnboardingUploadUrl(docType: string, ext = "jpg") {
  return callOnboarding("get_upload_url", { doc_type: docType, ext });
}
