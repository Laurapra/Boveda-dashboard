// src/components/AddBankAccountModal.tsx
import React, { useState } from "react";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { useBankAccounts } from "../hooks/useBankAccounts";
import type { ToastType, AccountType, DocumentType } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

const BANKS = [
  "Bancolombia", "Davivienda", "Banco de Bogotá",
  "BBVA Colombia", "Scotiabank Colpatria", "Banco Popular",
  "Nu Colombia", "Lulo Bank",
];

export const AddBankAccountModal: React.FC<Props> = ({ isOpen, onClose, onToast }) => {
  const { addAccount } = useBankAccounts();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bankName, setBankName]               = useState("");
  const [accountNumber, setAccountNumber]     = useState("");
  const [accountType, setAccountType]         = useState<AccountType>("ahorros");
  const [holderName, setHolderName]           = useState("");
  const [documentType, setDocumentType]       = useState<DocumentType>("cedula");
  const [documentNumber, setDocumentNumber]   = useState("");

  const selectStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px",
    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none",
  };

  const resetForm = () => {
    setBankName(""); setAccountNumber(""); setAccountType("ahorros");
    setHolderName(""); setDocumentType("cedula"); setDocumentNumber("");
    setError(null);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!bankName || !accountNumber || !holderName || !documentNumber) {
      setError("Completa todos los campos");
      return;
    }

    setLoading(true);
    const err = await addAccount({
      bankName, accountNumber, accountType,
      accountHolderName: holderName, documentType, documentNumber,
    });
    setLoading(false);

    if (err) { setError(err); return; }

    onToast("ok", "Cuenta agregada", "En proceso de verificación");
    resetForm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Agregar Cuenta Bancaria"
      subtitle="Completa la información de tu cuenta bancaria"
      maxWidth={480}
      footer={
        <>
          <button
            onClick={handleClose}
            style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Guardando…" : "Agregar cuenta"}
          </button>
        </>
      }
    >
      <div>
        <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>
          Banco <span style={{ color: "var(--accent)" }}>*</span>
        </label>
        <select value={bankName} onChange={(e) => setBankName(e.target.value)} style={selectStyle}>
          <option value="">Selecciona un banco</option>
          {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <Input
          label="Número de cuenta" required
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
          placeholder="1234567890"
        />
        <div>
          <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>
            Tipo de cuenta
          </label>
          <select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} style={selectStyle}>
            <option value="ahorros">Ahorros</option>
            <option value="corriente">Corriente</option>
          </select>
        </div>
      </div>

      <Input
        label="Nombre del titular" required
        value={holderName}
        onChange={(e) => setHolderName(e.target.value)}
        placeholder="Como aparece en la cuenta"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div>
          <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>
            Tipo de documento
          </label>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)} style={selectStyle}>
            <option value="cedula">Cédula</option>
            <option value="nit">NIT</option>
            <option value="pasaporte">Pasaporte</option>
          </select>
        </div>
        <Input
          label="Número de documento" required
          value={documentNumber}
          onChange={(e) => setDocumentNumber(e.target.value)}
          placeholder="1234567890"
        />
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
          {error}
        </div>
      )}
    </Modal>
  );
};