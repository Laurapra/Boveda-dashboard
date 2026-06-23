// src/pages/BankAccounts.tsx
import React, { useState } from "react";
import { useBankAccounts } from "../hooks/useBankAccounts";
import { AddBankAccountModal } from "../components/AddBankAccountModal";
import type { ToastType } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

export const BankAccountsView: React.FC<Props> = ({ onToast }) => {
  const { accounts, loading, setDefault, deleteAccount } = useBankAccounts();
  const [modalOpen, setModalOpen] = useState(false);

  const handleSetDefault = async (id: string) => {
    const err = await setDefault(id);
    if (err) onToast("error", "Error", err);
    else onToast("ok", "Actualizado", "Cuenta marcada como predeterminada");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta cuenta bancaria?")) return;
    const err = await deleteAccount(id);
    if (err) onToast("error", "Error", err);
    else onToast("ok", "Eliminada", "Cuenta bancaria eliminada");
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px" }}>Cuentas Bancarias</h1>
          <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>
            Gestiona las cuentas para tus dispersiones
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          style={{ padding: "10px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
        >
          + Agregar cuenta
        </button>
      </div>

      {/* Lista de cuentas */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--t3)" }}>Cargando…</div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <div style={{ width: "54px", height: "54px", borderRadius: "14px", background: "var(--elevated)", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "var(--t2)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="24" height="24">
              <rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" strokeLinecap="round" />
            </svg>
          </div>
          <h4 style={{ fontSize: "15px", color: "var(--t1)", marginBottom: "6px" }}>Sin cuentas registradas</h4>
          <p style={{ color: "var(--t3)", fontSize: "13px" }}>Agrega una cuenta bancaria para empezar a dispersar fondos.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {accounts.map((acc) => (
            <div
              key={acc.id}
              style={{
                background: "var(--surface)",
                border: acc.is_default ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "18px",
                boxShadow: "var(--shadow)",
                position: "relative",
              }}
            >
              {acc.is_default && (
                <span style={{ position: "absolute", top: "14px", right: "14px", fontSize: "10.5px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", background: "var(--accent-dim)", color: "var(--accent)" }}>
                  PREDETERMINADA
                </span>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--elevated)", display: "grid", placeItems: "center", color: "var(--accent)", flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "15px" }}>{acc.bank_name}</div>
                  <div style={{ fontSize: "12.5px", color: "var(--t3)" }}>
                    {acc.account_type === "ahorros" ? "Ahorros" : "Corriente"} · ****{acc.account_number.slice(-4)}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "6px" }}>{acc.account_holder_name}</div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                {acc.is_verified ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", fontWeight: 600, color: "var(--success)", background: "var(--success-dim)", padding: "3px 9px", borderRadius: "7px" }}>
                    ✓ Verificada
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", fontWeight: 600, color: "var(--warning)", background: "var(--warning-dim)", padding: "3px 9px", borderRadius: "7px" }}>
                    En verificación
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                {!acc.is_default && (
                  <button
                    onClick={() => handleSetDefault(acc.id)}
                    style={{ flex: 1, padding: "7px", fontSize: "12.5px", fontWeight: 600, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer" }}
                  >
                    Hacer predeterminada
                  </button>
                )}
                <button
                  onClick={() => handleDelete(acc.id)}
                  style={{ padding: "7px 12px", fontSize: "12.5px", fontWeight: 600, border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", background: "var(--error-dim)", color: "var(--error)", cursor: "pointer" }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddBankAccountModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onToast={onToast} />
    </div>
  );
};