// src/types/index.ts

// ── Usuario ──────────────────────────────────────────────────────
// Representa un comerciante registrado en el sistema
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "operator" | "viewer";
  created_at: string;
}

// ── Transacciones ────────────────────────────────────────────────
export type PaymentMethod = "Bre-B" | "Nequi" | "Link";

export type TxStatus = "paid" | "frozen" | "pending" | "failed" | "held";


export interface Transaction {
  id: string;
  method: PaymentMethod;
  payer_name: string;
  payer_doc: string;
  reference: string;
  amount: number;
  fee: number;
  status: TxStatus;
  created_at: string;
}

// ── Dispersión ───────────────────────────────────────────────────
export interface Payout {
  id: string;
  destination_key: string;
  holder_name: string;
  amount: number;
  fee: number;
  concept: string;
  method: PaymentMethod;
  created_at: string;
}

// ── Estado de cuenta ─────────────────────────────────────────────
export interface StatementRow {
  date: string;
  concept: string;
  type: "in" | "out";
  amount: number;
  fee: number;
  balance: number;
}

// ── Toast (notificaciones) ───────────────────────────────────────
export type ToastType = "ok" | "info" | "error";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
}
// CUENTAS BANCARIAS
export type AccountType="ahorros"|"corriente";
export type DocumentType="cedula"|"nit"|"pasaporte";

export interface BankAccount {
  id: string;
  user_id:string;
  bank_name:string;
  account_number:string;
  account_type:AccountType;
  account_holder_name:string;
  document_type:DocumentType;
  document_number:string;
  is_verified:boolean;
  is_default:boolean;
  created_at:string;
}
// ── KYC / KYB ────────────────────────────────────────────────────
export type KycStatus = "not_submitted" | "pending" | "approved" | "rejected";
export type BusinessType = "sas" | "ltda" | "sa" | "natural" | "otro";
export interface KycPersonal {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  nationality: string;
  document_type: DocumentType;
  document_number: string;
  address: string | null;
  city: string | null;
  department: string | null;
  document_front_url: string | null;
  document_back_url: string | null;
  selfie_url: string | null;
  status: KycStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  updated_at: string;
}

export interface KybBusiness {
  id: string;
  user_id: string;
  business_name: string;
  business_type: BusinessType;
  nit: string;
  incorporation_date: string | null;
  city: string | null;
  department: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  legal_rep_name: string;
  legal_rep_doc_type: string;
  legal_rep_doc_number: string;
  rut_url: string | null;
  chamber_commerce_url: string | null;
  legal_rep_doc_url: string | null;
  status: KycStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  updated_at: string;
}