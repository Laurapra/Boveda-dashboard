// src/pages/Seguridad.tsx
//
// Activación de 2FA (TOTP — Google Authenticator, Authy, etc.) usando el
// sistema de MFA que trae Supabase Auth. Es un requisito para poder
// dispersar dinero: bepay-payouts (payout_breb / payout_ach) exige que la
// sesión tenga el claim "aal2" en el JWT — eso SOLO se logra pasando por
// supabase.auth.mfa.challengeAndVerify() con un factor ya verificado, así
// que sin activarlo acá, cualquier intento de enviar dinero queda bloqueado
// del lado del servidor (no solo escondido en la interfaz).
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { ToastType } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

interface Factor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

export const SeguridadView: React.FC<Props> = ({ onToast }) => {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);

  const [enrolling, setEnrolling] = useState(false);
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw new Error(error.message);
      setFactors((data?.totp ?? []) as Factor[]);
    } catch (err: unknown) {
      onToast("error", "Error cargando 2FA", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await load();
    });
    return () => { cancelled = true; };
  }, [load]);

  const verifiedFactor = factors.find((f) => f.status === "verified") ?? null;

  const handleStartEnroll = async () => {
    setEnrolling(true);
    setCode("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw new Error(error.message);
      setEnrollFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (err: unknown) {
      onToast("error", "No se pudo iniciar la activación", getErrorMessage(err));
      setEnrolling(false);
    }
  };

  const handleCancelEnroll = async () => {
    // Si cancela a mitad de camino, se limpia el factor "unverified" que
    // quedó a medio crear — si no, se acumulan factores sin verificar cada
    // vez que alguien empieza y no termina el proceso.
    if (enrollFactorId) {
      try { await supabase.auth.mfa.unenroll({ factorId: enrollFactorId }); } catch { /* best-effort */ }
    }
    setEnrolling(false);
    setEnrollFactorId(null);
    setQrCode(null);
    setSecret(null);
    setCode("");
  };

  const handleVerify = async () => {
    if (!enrollFactorId || code.trim().length !== 6) return;
    setVerifying(true);
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: enrollFactorId });
      if (challengeErr) throw new Error(challengeErr.message);

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyErr) throw new Error(verifyErr.message);

      onToast("ok", "2FA activado", "Ya podés dispersar dinero con verificación en dos pasos.");
      setEnrolling(false);
      setEnrollFactorId(null);
      setQrCode(null);
      setSecret(null);
      setCode("");
      await load();
    } catch (err: unknown) {
      onToast("error", "Código incorrecto", getErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleRemove = async (factorId: string) => {
    if (!confirm("¿Desactivar 2FA? No vas a poder dispersar dinero hasta que lo actives de nuevo.")) return;
    setRemovingId(factorId);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw new Error(error.message);
      onToast("ok", "2FA desactivado", "");
      await load();
    } catch (err: unknown) {
      onToast("error", "Error", getErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "var(--radius)", padding: "22px", boxShadow: "var(--shadow)",
  };

  return (
    <div style={{ animation: "fadeUp .3s ease", maxWidth: "560px" }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <i className="ti ti-shield-lock" style={{ color: "var(--accent)", fontSize: "20px" }} />
          <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--t1)" }}>Verificación en dos pasos (2FA)</div>
        </div>
        <div style={{ fontSize: "12.5px", color: "var(--t3)", marginBottom: "18px" }}>
          Obligatoria para poder dispersar dinero. Usá cualquier app autenticadora compatible con TOTP — Google Authenticator, Authy, Microsoft Authenticator, 1Password, etc.
        </div>

        {loading ? (
          <div style={{ fontSize: "13px", color: "var(--t3)" }}>Cargando…</div>
        ) : verifiedFactor && !enrolling ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "var(--success-dim)", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", marginBottom: "14px" }}>
              <i className="ti ti-shield-check" style={{ color: "var(--success)", fontSize: "18px" }} />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--success)" }}>2FA activo</div>
                <div style={{ fontSize: "11.5px", color: "var(--t3)" }}>Se te va a pedir un código cada vez que envíes dinero.</div>
              </div>
            </div>
            <button
              onClick={() => handleRemove(verifiedFactor.id)}
              disabled={removingId === verifiedFactor.id}
              style={{ padding: "9px 16px", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", background: "var(--error-dim)", color: "var(--error)", fontWeight: 600, fontSize: "13px", cursor: "pointer", opacity: removingId === verifiedFactor.id ? 0.6 : 1 }}
            >
              {removingId === verifiedFactor.id ? "Desactivando…" : "Desactivar 2FA"}
            </button>
          </div>
        ) : !enrolling ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "var(--warning-dim)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", marginBottom: "14px" }}>
              <i className="ti ti-alert-triangle" style={{ color: "var(--warning)", fontSize: "18px" }} />
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--warning)" }}>Todavía no activaste el 2FA — no vas a poder dispersar dinero.</div>
            </div>
            <button
              onClick={handleStartEnroll}
              style={{ padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              <i className="ti ti-shield-plus" style={{ marginRight: "6px" }} />
              Activar 2FA
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "12.5px", color: "var(--t2)", marginBottom: "12px" }}>
              1. Escaneá este código QR con tu app autenticadora.
            </div>
            {qrCode ? (
              <div style={{ background: "#fff", padding: "14px", borderRadius: "var(--radius-sm)", display: "inline-block", marginBottom: "14px" }}>
                <img src={qrCode} alt="Código QR" style={{ width: "180px", height: "180px", display: "block" }} />
              </div>
            ) : null}
            {secret ? (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "4px" }}>¿No podés escanear? Escribí este código a mano:</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "13px", background: "var(--elevated)", padding: "8px 11px", borderRadius: "var(--radius-sm)", letterSpacing: "1px", wordBreak: "break-all" }}>{secret}</div>
              </div>
            ) : null}
            <div style={{ fontSize: "12.5px", color: "var(--t2)", marginBottom: "8px" }}>
              2. Escribí el código de 6 dígitos que te muestra la app.
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                style={{ width: "140px", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "18px", letterSpacing: "4px", textAlign: "center", fontFamily: "var(--mono)", outline: "none" }}
              />
              <button
                onClick={handleVerify}
                disabled={code.length !== 6 || verifying}
                style={{ padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: code.length !== 6 || verifying ? "not-allowed" : "pointer", opacity: code.length !== 6 || verifying ? 0.6 : 1 }}
              >
                {verifying ? "Verificando…" : "Confirmar"}
              </button>
              <button
                onClick={handleCancelEnroll}
                style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
