// src/pages/Login.tsx
import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { Input } from "../components/ui/Input";

interface Props {
  onGoRegister: () => void; // callback para cambiar a la pantalla de registro
}

export const Login: React.FC<Props> = ({ onGoRegister }) => {
  const { signIn } = useAuthStore();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // evita que el form recargue la página
    setError(null);
    setLoading(true);

    const err = await signIn(email, password);
    if (err) setError(err); // signIn devuelve null si todo salió bien

    setLoading(false);
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "40px", justifyContent: "center" }}>
          <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "linear-gradient(140deg, var(--accent), #7c5cff)", display: "grid", placeItems: "center", boxShadow: "0 8px 24px -8px var(--accent-ring)" }}>
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path d="M12 2L3 6.5v6c0 5 3.9 8.4 9 9.5 5.1-1.1 9-4.5 9-9.5v-6L12 2z" fill="#fff" opacity=".95" />
              <path d="M9 12l2 2 4-4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "22px", letterSpacing: "-.4px" }}>Bóveda</div>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 600, letterSpacing: ".4px", textTransform: "uppercase" }}>Payment Gateway</div>
          </div>
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

        <p style={{ textAlign: "center", marginTop: "20px", color: "var(--t3)", fontSize: "13px" }}>
          ¿No tienes cuenta?{" "}
          <button onClick={onGoRegister} style={{ color: "var(--accent)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            Regístrate
          </button>
        </p>
      </div>
    </div>
  );
};