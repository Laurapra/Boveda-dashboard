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