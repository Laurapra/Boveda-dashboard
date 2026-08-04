// src/pages/ResetPassword.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Logo from "../assets/Logo.png";

interface Props {
  onDone: () => void;
}

type Stage =
  | "checking"    // revisando qué trajo el enlace
  | "confirm"     // enlace nuevo (token_hash) — espera clic explícito del usuario
  | "form"        // sesión de recuperación válida — mostrar formulario
  | "expired";    // enlace inválido, ya usado o vencido

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

export const ResetPassword: React.FC<Props> = ({ onDone }) => {
  const [stage, setStage] = useState<Stage>("checking");
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // ── Detectar cómo llegó el usuario ──
  // 1) Enlace nuevo: ?token_hash=...&type=recovery — NO verificamos automático,
  //    solo lo guardamos y esperamos un clic real (evita que un escáner de
  //    correo corporativo "gaste" el enlace de un solo uso antes de que la
  //    persona lo abra).
  // 2) Enlace clásico: Supabase ya redirigió con #access_token=... y detectSessionInUrl
  //    (por defecto en supabase-js) crea la sesión sola — solo confirmamos que exista.
  // 3) Error explícito en el hash: #error=access_denied&error_code=otp_expired...
  useEffect(() => {
    // Todo el cuerpo va envuelto en una promesa resuelta (con guard
    // "cancelled") en vez de llamar setState directo en el cuerpo del
    // efecto — evita el warning de react-hooks/set-state-in-effect y de
    // paso deja un solo lugar para cortar si el componente se desmonta.
    let cancelled = false;

    Promise.resolve().then(async () => {
      if (cancelled) return;

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (hashParams.get("error")) {
        setStage("expired");
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      const th = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (th && type === "recovery") {
        setTokenHash(th);
        setStage("confirm");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStage(data.session ? "form" : "expired");
    });

    return () => { cancelled = true; };
  }, []);

  const handleConfirm = async () => {
    if (!tokenHash) return;
    setConfirming(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (err) throw new Error(err.message);
      setStage("form");
    } catch {
      setStage("expired");
    } finally {
      setConfirming(false);
    }
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

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
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
          {stage === "checking" ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--t3)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: "spin 1s linear infinite", marginBottom: "10px" }}>
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
              <div style={{ fontSize: "13px" }}>Verificando enlace…</div>
            </div>
          ) : stage === "expired" ? (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--error-dim)", color: "var(--error)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "24px" }}>
                ✕
              </div>
              <h1 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Enlace inválido o vencido</h1>
              <p style={{ color: "var(--t2)", fontSize: "13.5px", marginBottom: "24px" }}>
                Este enlace de recuperación ya no es válido — pudo haber expirado, ya haberse usado, o haber sido abierto por un filtro de seguridad de tu correo antes de que lo abrieras tú. Solicita uno nuevo desde la pantalla de inicio de sesión.
              </p>
              <button onClick={onDone} style={primaryBtn}>
                Volver al inicio de sesión
              </button>
            </div>
          ) : stage === "confirm" ? (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--accent-dim)", color: "var(--accent)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "22px" }}>
                🔑
              </div>
              <h1 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Confirmar recuperación</h1>
              <p style={{ color: "var(--t2)", fontSize: "13.5px", marginBottom: "24px" }}>
                Por seguridad, confirma que fuiste tú quien solicitó restablecer la contraseña
              </p>
              {error ? (
                <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)", marginBottom: "16px", textAlign: "left" }}>
                  {error}
                </div>
              ) : null}
              <button onClick={handleConfirm} disabled={confirming} style={{ ...primaryBtn, opacity: confirming ? 0.7 : 1, cursor: confirming ? "not-allowed" : "pointer" }}>
                {confirming ? "Confirmando…" : "Sí, soy yo — continuar"}
              </button>
            </div>
          ) : !done ? (
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
                  style={{ ...primaryBtn, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
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
              <button onClick={onDone} style={primaryBtn}>
                Ir al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
