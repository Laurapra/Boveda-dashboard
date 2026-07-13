// src/types/index.ts

// ── Usuario ──────────────────────────────────────────────────────
// Representa un comerciante registrado en el sistema
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "operator" | "viewer";
  tarifa_recibir?: number;
  tarifa_enviar?: number;
  tarifa_variable?: number;
  is_active?: boolean;
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
  user_id: string;
  bank_name: string;
  bank_code?: string | null;
  account_number: string;
  account_type: AccountType;
  account_holder_name: string;
  document_type: DocumentType;
  document_number: string;
  is_verified: boolean;
  is_default: boolean;
  created_at: string;
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
// ── Wallet (Billetera) ────────────────────────────────────────────
export type WalletCurrency = "COP" | "USD" | "EUR";
export type WalletNetwork  = "Bre-B" | "ACH" | "Nequi";

export interface Wallet {
  id: string;
  user_id: string;
  name: string;
  currency: WalletCurrency;
  network: WalletNetwork;
  account_key: string;        // llave Bre-B o número de cuenta
  bank_name?: string;
  balance: number;
  is_active: boolean;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  type: "received" | "sent";
  amount: number;
  description: string;
  status: "Completado" | "Pendiente" | "Rechazado";
  counterpart_name?: string;
  created_at: string;
}

// ── Beneficiario ─────────────────────────────────────────────────
export type DocType = "CC" | "CE" | "NIT" | "PAS";
export type AccountKind = "ahorros" | "corriente" | "breb";

export interface BeneficiaryAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_kind: AccountKind;
  is_default: boolean;
}

export interface Beneficiary {
  id: string;
  user_id: string;
  full_name: string;
  doc_type: DocType;
  doc_number: string;
  email?: string;
  phone?: string;
  city?: string;
  accounts: BeneficiaryAccount[];
  created_at: string;
}

// ── Reporte ───────────────────────────────────────────────────────
export type ReportType = "extracto" | "dispersiones" | "recepciones" | "beneficiarios";

export interface ReportFilter {
  type: ReportType;
  from: string;
  to: string;
  status: string;
}
// ── Constantes de negocio ────────────────────────────────────────
export const ESTADOS = Object.freeze({
  COMPLETADO: "Completado", PENDIENTE: "Pendiente",
  RECHAZADO: "Rechazado",   FALLIDO: "Fallido",
});
export const TIPOS = Object.freeze({ RECIBIDO: "Recibido", ENVIADO: "Enviado" });
export const TARIFAS = Object.freeze({ CARGO_FIJO: 1190, VARIABLE_PCT: 0.0012 });
export const EMPRESA = Object.freeze({
  nombre: "Global Coin SAS", nit: "901.234.567-8",
  llave: "globalcoin@breb.co", portal: "Ramplix",
});

// ── Transacción ──────────────────────────────────────────────────
export type TxnTipo   = "Recibido" | "Enviado";
export type TxnEstado = "Completado" | "Pendiente" | "Rechazado" | "Fallido";

export interface Txn {
  id: string;
  tipo: TxnTipo;
  desc: string;
  monto: number;
  comision: number;
  total?: number;
  estado: TxnEstado;
  fecha: Date;
  divisa: string;
  refBancaria?: string;
  // Solo dispersiones
  benNombre?: string;
  benTipodoc?: string;
  benNumdoc?: string;
  tipoCta?: string;
  banco?: string;
  llave?: string;
}

// ── Beneficiario ─────────────────────────────────────────────────
export interface BenCuenta {
  tipo: "Bre-B" | "Ahorros" | "Corriente";
  banco: string;
  llave: string;
  estado: "Activa" | "Inactiva";
}

export interface Ben {
  id: number;
  nombre: string;
  tipodoc: string;
  numdoc: string;
  indicativo: string;
  celular: string;
  correo: string;
  cuentas: BenCuenta[];
  vol: { d: number; m: number; a: number };
}

// ── Wallet ───────────────────────────────────────────────────────
export interface WalletCatalogItem {
  divisa: string;
  tipo: string;
  banco: string;
  llave: string;
  desc: string;
}
// ── Admin ─────────────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "operator" | "viewer";
  tarifa_recibir: number;
  tarifa_enviar: number;
  tarifa_variable: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  role: "operator" | "viewer";
  tarifa_recibir: number;
  tarifa_enviar: number;
  tarifa_variable: number;
}