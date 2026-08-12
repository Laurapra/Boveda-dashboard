// src/components/TwoFactorPrompt.tsx
//
// Paso de verificación 2FA antes de dispersar dinero. Solo confirma la
// identidad del lado del cliente (challengeAndVerify eleva la sesión a
// aal2) — la verdadera protección está del lado del servidor: bepay-payouts
// rechaza cualquier payout_breb/payout_ach cuyo JWT no traiga el claim
// "aal2", así que aunque alguien se salte este modal a mano, la llamada a
// Bepay se bloquea igual.
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { Modal } from "./ui/Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

export const TwoFactorPrompt: React.FC<Props> = ({ isOpen, onClose, onVerified }) => {
  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkFactor = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCode("");
    try {
      const { data, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw new Error(listErr.message);
      const verified = (data?.totp ?? []).find((f) => f.status === "verified");
      if (!verified) {
        setNotEnrolled(true);
        setFactorId(null);
      } else {
        setNotEnrolled(false);
        setFactorId(verified.id);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await checkFactor();
    });
    return () => { cancelled = true; };
  }, [isOpen, checkFactor]);

  const handleVerify = async () => {
    if (!factorId || code.trim().length !== 6) return;
    setVerifying(true);
    setError(null);
    try {
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (verifyErr) throw new Error(verifyErr.message);
      setCode("");
      onVerified();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Verificación en dos pasos" subtitle="Confirmá tu identidad para enviar el dinero" maxWidth={380}>
      {loading ? (
        <div style={{ fontSize: "13px", color: "var(--t3)", padding: "12px 0" }}>Verificando...</div>
      ) : notEnrolled ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", background: "var(--warning-dim)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)" }}>
          <i className="ti ti-alert-triangle" style={{ color: "var(--warning)", fontSize: "18px", flexShrink: 0 }} />
          <div style={{ fontSize: "12.5px", color: "var(--warning)" }}>
            Todavía no activaste el 2FA — es obligatorio para dispersar dinero. Andá a <b>Seguridad</b> en el menú para activarlo.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: "12.5px", color: "var(--t2)", marginBottom: "10px" }}>
            Ingresá el código de 6 dígitos de tu app autenticadora.
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) handleVerify(); }}
            placeholder="000000"
            inputMode="numeric"
            autoFocus
            style={{ width: "100%", padding: "12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "22px", letterSpacing: "6px", textAlign: "center", fontFamily: "var(--mono)", outline: "none", marginBottom: "10px" }}
          />
          {error ? (
            <div style={{ fontSize: "12px", color: "var(--error)", marginBottom: "10px" }}>{error}</div>
          ) : null}
          <button
            onClick={handleVerify}
            disabled={code.length !== 6 || verifying}
            style={{ width: "100%", padding: "10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: code.length !== 6 || verifying ? "not-allowed" : "pointer", opacity: code.length !== 6 || verifying ? 0.6 : 1 }}
          >
            {verifying ? "Verificando..." : "Confirmar y enviar"}
          </button>
        </div>
      )}
    </Modal>
  );
};
