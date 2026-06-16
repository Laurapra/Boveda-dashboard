// src/pages/Register.tsx
import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { Input } from "../components/ui/Input";

interface Props {
  onGoLogin: () => void;
}

export const Register: React.FC<Props> = ({ onGoLogin }) => {
  const { signUp } = useAuthStore();
  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Fuerza de contraseña: 1-4 segmentos según longitud
  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : password.length < 14 ? 3 : 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validaciones del lado del cliente (antes de ir al servidor)
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    if (password.length < 8)  { setError("La contraseña debe tener al menos 8 caracteres"); return; }

    setLoading(true);
    const err = await signUp(email, password, fullName);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ position: "fixed", top: "-30%", left: "50%", transform: "translateX(-50%)", width: "600px", height: "400px", pointerEvents: "none", background: "radial-gradient(ellipse at center, rgba(91,127,255,.15) 0%, transparent 70%)" }} />

      <div style={{ width: "100%", maxWidth: "420px", animation: "fadeUp .4s ease" }}>
        {/* Logo — mismo que Login */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "36px", justifyContent: "center" }}>
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

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "32px", boxShadow: "var(--shadow)" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-.4px", marginBottom: "6px" }}>Crear cuenta</h1>
          <p style={{ color: "var(--t2)", fontSize: "14px", marginBottom: "28px" }}>Empieza a gestionar tus pagos en minutos</p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Input label="Nombre completo" type="text" placeholder="Carlos Mendoza"
              value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <Input label="Correo electrónico" type="email" placeholder="tu@empresa.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Contraseña" type="password" placeholder="Mínimo 8 caracteres"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Input label="Confirmar contraseña" type="password" placeholder="Repite tu contraseña"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} required />

            {/* Indicador visual de fuerza de contraseña */}
            {password && (
              <div>
                <div style={{ display: "flex", gap: "4px", marginBottom: "5px" }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{
                      flex: 1, height: "3px", borderRadius: "3px", transition: ".3s",
                      background: i <= strength
                        ? strength <= 2 ? "var(--warning)" : "var(--success)"
                        : "var(--border-strong)",
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: "11.5px", color: "var(--t3)" }}>
                  {strength <= 1 ? "Muy corta" : strength === 2 ? "Aceptable" : "Segura"}
                </span>
              </div>
            )}

            {error && (
              <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "12px", background: "var(--accent)", color: "#fff",
              border: "none", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "14px",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, transition: ".14s",
              boxShadow: "0 8px 20px -10px var(--accent-ring)",
            }}>
              {loading ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "20px", color: "var(--t3)", fontSize: "13px" }}>
          ¿Ya tienes cuenta?{" "}
          <button onClick={onGoLogin} style={{ color: "var(--accent)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
            Ingresar
          </button>
        </p>
      </div>
    </div>
  );
};