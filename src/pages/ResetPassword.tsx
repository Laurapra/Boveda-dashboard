// src/pages/ResetPassword.tsx
import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import Logo from "../assets/Logo.png";

interface Props {
  onDone: () => void;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

export const ResetPassword: React.FC<Props> = ({ onDone }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg)",
    color: "var(--t1)",
    fontSize: "13.5px",
    outline: "none",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw new Error(err.message);
      setDone(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div
        style={{
          position: "fixed",
          top: "-30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "400px",
          pointerEvents: "none",
          background: "radial-gradient(ellipse at center, rgba(91,127,255,.15) 0%, transparent 70%)",
        }}
      />

      <div style={{ width: "100%", maxWidth: "400px", animation: "fadeUp .4s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "40px" }}>
          <img src={Logo} alt="Logo" style={{ height: "64px", width: "auto", objectFit: "contain" }} />
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "32px", boxShadow: "var(--shadow)" }}>
          {!done ? (
            <>
              <h1 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-.4px", marginBottom: "6px" }}>Nueva contraseña</h1>
              <p style={{ color: "var(--t2)", fontSize: "13.5px", marginBottom: "24px" }}>Escribe tu nueva contraseña para tu cuenta</p>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", marginBottom: "7px" }}>Nueva contraseña</label>
                  <input type="password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", marginBottom: "7px" }}>Confirmar contraseña</label>
                  <input type="password" placeholder="Repite la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={inputStyle} />
                </div>

                {error ? (
                  <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? "Guardando…" : "Guardar nueva contraseña"}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "24px" }}>
                ✓
              </div>
              <h1 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Contraseña actualizada</h1>
              <p style={{ color: "var(--t2)", fontSize: "13.5px", marginBottom: "24px" }}>Ya puedes ingresar con tu nueva contraseña</p>
              <button
                onClick={onDone}
                style={{ width: "100%", padding: "12px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}
              >
                Ir al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};