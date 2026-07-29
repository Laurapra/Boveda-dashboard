// src/pages/Login.tsx
import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { supabase } from "../lib/supabase";
import { Input } from "../components/ui/Input";
import Logo from "../assets/Logo.png";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

export const Login: React.FC = () => {
  const { signIn } = useAuthStore();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ── Recuperar contraseña ──
  const [forgotOpen, setForgotOpen]     = useState(false);
  const [forgotEmail, setForgotEmail]   = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError]   = useState<string | null>(null);
  const [forgotSent, setForgotSent]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // evita que el form recargue la página
    setError(null);
    setLoading(true);

    const err = await signIn(email, password);
    if (err) setError(err); // signIn devuelve null si todo salió bien

    setLoading(false);
  };

  const openForgot = () => {
    setForgotEmail(email);
    setForgotError(null);
    setForgotSent(false);
    setForgotOpen(true);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw new Error(err.message);
      setForgotSent(true);
    } catch (err: unknown) {
      setForgotError(getErrorMessage(err));
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Pantalla: recuperar contraseña ──
  if (forgotOpen) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{
          position: "fixed", top: "-30%", left: "50%", transform: "translateX(-50%)",
          width: "600px", height: "400px", pointerEvents: "none",
          background: "radial-gradient(ellipse at center, rgba(91,127,255,.15) 0%, transparent 70%)",
        }} />

        <div style={{ width: "100%", maxWidth: "400px", animation: "fadeUp .4s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "40px" }}>
            <img src={Logo} alt="Logo" style={{ height: "64px", width: "auto", objectFit: "contain" }} />
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "32px", boxShadow: "var(--shadow)" }}>
            {!forgotSent ? (
              <>
                <h1 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-.4px", marginBottom: "6px" }}>Recuperar contraseña</h1>
                <p style={{ color: "var(--t2)", fontSize: "13.5px", marginBottom: "24px" }}>
                  Te enviaremos un enlace a tu correo para definir una nueva contraseña
                </p>

                <form onSubmit={handleForgotSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <Input label="Correo electrónico" type="email" placeholder="tu@empresa.com"
                    value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />

                  {forgotError ? (
                    <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
                      {forgotError}
                    </div>
                  ) : null}

                  <button type="submit" disabled={forgotLoading} style={{
                    width: "100%", padding: "12px",
                    background: "var(--accent)", color: "#fff",
                    border: "none", borderRadius: "var(--radius-sm)",
                    fontWeight: 700, fontSize: "14px",
                    cursor: forgotLoading ? "not-allowed" : "pointer",
                    opacity: forgotLoading ? 0.7 : 1, transition: ".14s",
                  }}>
                    {forgotLoading ? "Enviando…" : "Enviar enlace"}
                  </button>

                  <button type="button" onClick={() => setForgotOpen(false)} style={{
                    background: "none", border: "none", color: "var(--t2)",
                    fontSize: "13px", cursor: "pointer", padding: "4px",
                  }}>
                    ← Volver a iniciar sesión
                  </button>
                </form>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "24px" }}>
                  ✓
                </div>
                <h1 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Revisa tu correo</h1>
                <p style={{ color: "var(--t2)", fontSize: "13.5px", marginBottom: "24px" }}>
                  Te enviamos un enlace a <strong>{forgotEmail}</strong> para definir tu nueva contraseña
                </p>
                <button
                  onClick={() => setForgotOpen(false)}
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
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>

      {/* Gradiente decorativo de fondo */}
      <div style={{
        position: "fixed", top: "-30%", left: "50%", transform: "translateX(-50%)",
        width: "600px", height: "400px", pointerEvents: "none",
        background: "radial-gradient(ellipse at center, rgba(91,127,255,.15) 0%, transparent 70%)",
      }} />

      <div style={{ width: "100%", maxWidth: "400px", animation: "fadeUp .4s ease" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "40px" }}>
          <img src={Logo} alt="Logo" style={{ height: "64px", width: "auto", objectFit: "contain" }} />
        </div>

        {/* Tarjeta del formulario */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "32px", boxShadow: "var(--shadow)" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", marginBottom: "6px" }}>
            Bienvenido de vuelta
          </h1>
          <p style={{ color: "var(--t2)", fontSize: "14px", marginBottom: "28px" }}>
            Ingresa a tu panel de operaciones
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Input label="Correo electrónico" type="email" placeholder="tu@empresa.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required />

            <Input label="Contraseña" type="password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} required />

            <button
              type="button"
              onClick={openForgot}
              style={{
                alignSelf: "flex-end", background: "none", border: "none",
                color: "var(--accent)", fontSize: "12.5px", fontWeight: 600,
                cursor: "pointer", padding: 0, marginTop: "-8px",
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>

            {/* Error del servidor (credenciales incorrectas, etc.) */}
            {error && (
              <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "12px",
              background: "var(--accent)", color: "#fff",
              border: "none", borderRadius: "var(--radius-sm)",
              fontWeight: 700, fontSize: "14px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1, transition: ".14s",
              boxShadow: "0 8px 20px -10px var(--accent-ring)",
            }}>
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};