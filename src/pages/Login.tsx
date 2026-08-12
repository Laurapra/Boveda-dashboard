// src/pages/Login.tsx
import React, { useId, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { supabase } from "../lib/supabase";
import { Input } from "../components/ui/Input";
import Logo from "../assets/Logo.png";
import "./Login.css";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Correo o contraseña incorrectos. Revisa e intenta de nuevo.";
  }
  if (m.includes("email not confirmed")) {
    return "Debes confirmar tu correo antes de ingresar.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento e inténtalo otra vez.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "No hay conexión. Verifica tu internet e intenta de nuevo.";
  }
  return message;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M1 1l22 22" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="login-submit__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
    </svg>
  );
}

export const Login: React.FC = () => {
  const { signIn } = useAuthStore();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Completa tu correo y contraseña para continuar.");
      return;
    }

    setLoading(true);
    const err = await signIn(trimmed, password);
    if (err) setError(friendlyAuthError(err));
    setLoading(false);
  };

  const openForgot = () => {
    setForgotEmail(email.trim());
    setForgotError(null);
    setForgotSent(false);
    setForgotOpen(true);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setForgotError("Escribe el correo de tu cuenta.");
      return;
    }

    setForgotLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw new Error(err.message);
      setForgotSent(true);
    } catch (err: unknown) {
      setForgotError(friendlyAuthError(getErrorMessage(err)));
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__glow" aria-hidden />

      <aside className="login-page__brand" aria-hidden={false}>
        <div className="login-page__brandMark">
          <img src={Logo} alt="Ramplix" className="login-page__brandLogo" />
        </div>

        <div className="login-page__brandCopy">
          <h2>Tu panel de operaciones, listo donde estés</h2>
          <p>
            Ingresa de forma segura para gestionar billeteras, movimientos y beneficiarios desde cualquier dispositivo.
          </p>
          <div className="login-page__brandPoints">
            <div className="login-page__brandPoint">
              <span>✓</span>
              Acceso seguro a tu cuenta Ramplix
            </div>
            <div className="login-page__brandPoint">
              <span>✓</span>
              Pensado para móvil, tablet y escritorio
            </div>
            <div className="login-page__brandPoint">
              <span>✓</span>
              Recuperación de contraseña en un solo paso
            </div>
          </div>
        </div>

        <p style={{ color: "var(--t3)", fontSize: "12px" }}>© {new Date().getFullYear()} Ramplix</p>
      </aside>

      <main className="login-page__panel">
        <div className="login-page__shell">
          <div className="login-page__mobileBrand">
            <img src={Logo} alt="Ramplix" />
            <p>Portal de operaciones</p>
          </div>

          <div className="login-card">
            {forgotOpen ? (
              !forgotSent ? (
                <>
                  <h1 className="login-card__title">Recuperar contraseña</h1>
                  <p className="login-card__subtitle">
                    Te enviaremos un enlace a tu correo para definir una nueva contraseña.
                  </p>

                  <form className="login-form" onSubmit={handleForgotSubmit} noValidate>
                    <div className="login-field">
                      <Input
                        label="Correo electrónico"
                        type="email"
                        name="email"
                        autoComplete="email"
                        inputMode="email"
                        enterKeyHint="send"
                        placeholder="tu@empresa.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        disabled={forgotLoading}
                      />
                    </div>

                    {forgotError ? (
                      <div className="login-alert login-alert--error" role="alert">
                        <svg className="login-alert__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                        </svg>
                        <span>{forgotError}</span>
                      </div>
                    ) : null}

                    <button type="submit" className="login-submit" disabled={forgotLoading}>
                      {forgotLoading ? (
                        <>
                          <Spinner />
                          Enviando…
                        </>
                      ) : (
                        "Enviar enlace"
                      )}
                    </button>

                    <button
                      type="button"
                      className="login-link login-link--muted"
                      onClick={() => setForgotOpen(false)}
                      disabled={forgotLoading}
                    >
                      ← Volver a iniciar sesión
                    </button>
                  </form>
                </>
              ) : (
                <div className="login-success">
                  <div className="login-success__badge" aria-hidden>✓</div>
                  <h1 className="login-card__title">Revisa tu correo</h1>
                  <p className="login-card__subtitle">
                    Enviamos un enlace a <span className="login-success__email">{forgotEmail}</span> para definir tu nueva contraseña.
                    Si no lo ves, revisa spam o promociones.
                  </p>
                  <button type="button" className="login-submit" onClick={() => setForgotOpen(false)}>
                    Ir al inicio de sesión
                  </button>
                </div>
              )
            ) : (
              <>
                <h1 className="login-card__title">Bienvenido de vuelta</h1>
                <p className="login-card__subtitle">Ingresa a tu panel de operaciones</p>

                <form className="login-form" onSubmit={handleSubmit} noValidate>
                  <div className="login-field">
                    <Input
                      label="Correo electrónico"
                      type="email"
                      name="email"
                      autoComplete="email"
                      inputMode="email"
                      enterKeyHint="next"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="tu@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="login-field">
                    <label htmlFor={passwordId} style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "6px" }}>
                      Contraseña <span style={{ color: "var(--accent)" }}>*</span>
                    </label>
                    <div className="login-password">
                      <input
                        id={passwordId}
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        enterKeyHint="go"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        style={{
                          width: "100%",
                          minHeight: 48,
                          padding: "12px 52px 12px 14px",
                          border: "1px solid var(--border)",
                          borderRadius: 11,
                          background: "var(--bg)",
                          color: "var(--t1)",
                          fontSize: 16,
                          outline: "none",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "var(--accent)";
                          e.target.style.boxShadow = "0 0 0 3px var(--accent-ring)";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "var(--border)";
                          e.target.style.boxShadow = "none";
                        }}
                      />
                      <button
                        type="button"
                        className="login-password__toggle"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        tabIndex={0}
                      >
                        <EyeIcon open={showPassword} />
                      </button>
                    </div>
                  </div>

                  <div className="login-form__row">
                    <button type="button" className="login-link" onClick={openForgot} disabled={loading}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>

                  {error ? (
                    <div className="login-alert login-alert--error" role="alert" aria-live="assertive">
                      <svg className="login-alert__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                      </svg>
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <button type="submit" className="login-submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner />
                        Ingresando…
                      </>
                    ) : (
                      "Ingresar"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="login-footer">Si no tienes acceso, solicita tu usuario al administrador.</p>
        </div>
      </main>
    </div>
  );
};
