// src/components/RegisterBrebKeyModal.tsx
import React, { useState, useEffect } from "react";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { registerBrebKey, getBrebKeys } from "../lib/bepayClient";
import { RegisterBrebMerchantModal } from "./RegisterBrebMerchantModal";
import type { ToastType } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

interface BrebKey {
  id: string | number;
  key_value: string;
  reference: string;
  status: string;
}

type Step = "list" | "create";

export const RegisterBrebKeyModal: React.FC<Props> = ({ isOpen, onClose, onToast }) => {
  const [step, setStep]           = useState<Step>("list");
  const [keys, setKeys]           = useState<BrebKey[]>([]);
  const [loadingKeys, setLoading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [showMerchantRegister, setShowMerchantRegister] = useState(false);

  // Campos del formulario
  const [keyValue, setKeyValue]   = useState("");
  const [reference, setReference] = useState("");

  // Validación en tiempo real del formato de llave
  const keyError = keyValue && !/^[a-zA-Z0-9._-]{3,30}$/.test(keyValue)
    ? "Solo letras, números, puntos, guiones. Entre 3 y 30 caracteres."
    : null;

  // Carga las llaves existentes al abrir
  useEffect(() => {
    if (!isOpen) return;
    setStep("list");
    fetchKeys();
  }, [isOpen]);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await getBrebKeys();
      setKeys(res?.data ?? []);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep("list"); setKeyValue(""); setReference(""); setError(null);
    onClose();
  };

  const handleRegister = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!keyValue || keyError) return;
  setSaving(true);
  setError(null);

  try {
    const res = await registerBrebKey(reference, keyValue);

    // ── LOG TEMPORAL — ver la respuesta completa ──
    console.log("Respuesta completa de Bepay:", JSON.stringify(res, null, 2));

    if (res?.success === false) {
      const msg = typeof res.message === "string"
        ? res.message
        : JSON.stringify(res.message ?? "Error desconocido");

      console.log("Mensaje extraído:", msg);

      if (msg.toLowerCase().includes("no se encontró el usuario") || msg.toLowerCase().includes("intenta registrar")) {
        setError("Tu comercio no está registrado en Bre-B todavía. Debes completar el registro inicial.");
      } else {
        setError(msg);
      }
      return;
    }

    onToast("ok", "Llave Bre-B registrada", `@${keyValue} lista para recibir pagos`);
    setKeyValue(""); setReference("");
    await fetchKeys();
    setStep("list");
  } catch (err: any) {
    console.error("Error en catch:", err);
    setError(err.message);
  } finally {
    setSaving(false);
  }
};

  // ── Estilos compartidos ──────────────────────────────────────────
  const chip = (color: string, bg: string, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, color, background: bg }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color }} />
      {label}
    </span>
  );

  const statusChip = (status: string) => {
    if (status === "ACTIVE" || status === "active")
      return chip("var(--success)", "var(--success-dim)", "Activa");
    if (status === "PENDING" || status === "pending")
      return chip("var(--warning)", "var(--warning-dim)", "Pendiente");
    return chip("var(--t3)", "var(--elevated)", status);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={step === "list" ? "Llaves Bre-B" : "Registrar nueva llave"}
        subtitle={
          step === "list"
            ? "Llaves registradas para recibir pagos"
            : "Crea un alias para recibir pagos Bre-B"
        }
        maxWidth={500}
        footer={
          step === "list" ? (
            <>
              <button
                onClick={handleClose}
                style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}
              >
                Cerrar
              </button>
              <button
                onClick={() => { setStep("create"); setError(null); }}
                style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "7px" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Nueva llave
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep("list"); setError(null); }}
                style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}
              >
                ← Volver
              </button>
              <button
                onClick={handleRegister}
                disabled={saving || !!keyError || !keyValue}
                style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: saving || !!keyError || !keyValue ? "not-allowed" : "pointer", opacity: saving || !!keyError || !keyValue ? 0.5 : 1 }}
              >
                {saving ? "Registrando…" : "Registrar llave"}
              </button>
            </>
          )
        }
      >
        {/* ── PASO 1: Lista de llaves ── */}
        {step === "list" && (
          <>
            {loadingKeys ? (
              <div style={{ textAlign: "center", padding: "32px", color: "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                </svg>
                Consultando llaves en Bepay…
              </div>
            ) : keys.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px" }}>
                <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "var(--elevated)", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "var(--t2)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ fontWeight: 600, fontSize: "14.5px", marginBottom: "6px" }}>Sin llaves registradas</div>
                <div style={{ fontSize: "12.5px", color: "var(--t3)" }}>
                  Registra una llave para empezar a recibir pagos Bre-B
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {keys.map((k, i) => (
                  <div
                    key={k.id ?? i}
                    style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}
                  >
                    <div style={{ width: "38px", height: "38px", borderRadius: "9px", background: "var(--accent-dim)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "14px", fontFamily: "var(--mono)" }}>
                        @{k.key_value}
                      </div>
                      {k.reference && (
                        <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>
                          Ref: {k.reference}
                        </div>
                      )}
                    </div>

                    {statusChip(k.status)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── PASO 2: Formulario de registro ── */}
        {step === "create" && (
          <>
            <div style={{ padding: "12px 14px", background: "var(--accent-dim)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)", lineHeight: 1.6 }}>
              <b style={{ color: "var(--accent)" }}>¿Qué es una llave Bre-B?</b> Es un alias personalizado que identifica tu cuenta para recibir pagos. Por ejemplo: <code style={{ fontFamily: "var(--mono)", background: "var(--elevated)", padding: "1px 6px", borderRadius: "4px", color: "var(--accent)" }}>@minegocio</code>
            </div>

            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>
                Llave (alias) <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontWeight: 700, fontSize: "15px", pointerEvents: "none" }}>@</span>
                <input
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value.toLowerCase().replace(/\s/g, ""))}
                  placeholder="minegocio"
                  maxLength={30}
                  style={{
                    width: "100%", padding: "10px 12px 10px 28px",
                    border: `1px solid ${keyError ? "var(--error)" : "var(--border)"}`,
                    borderRadius: "var(--radius-sm)", background: "var(--bg)",
                    color: "var(--t1)", fontSize: "14px", fontFamily: "var(--mono)",
                    outline: "none", transition: "border-color .14s, box-shadow .14s",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = keyError ? "var(--error)" : "var(--accent)"; e.target.style.boxShadow = `0 0 0 3px ${keyError ? "var(--error-dim)" : "var(--accent-ring)"}`; }}
                  onBlur={(e)  => { e.target.style.borderColor = keyError ? "var(--error)" : "var(--border)"; e.target.style.boxShadow = "none"; }}
                />
              </div>

              {keyValue && !keyError && (
                <div style={{ marginTop: "8px", padding: "8px 12px", background: "var(--success-dim)", border: "1px solid color-mix(in srgb, var(--success) 25%, transparent)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--success)", display: "flex", alignItems: "center", gap: "8px" }}>
                  ✓ Tu llave quedará como:{" "}
                  <code style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>@{keyValue}</code>
                </div>
              )}
              {keyError && (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--error)" }}>{keyError}</div>
              )}
              <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--t3)" }}>
                Solo letras, números, puntos y guiones · entre 3 y 30 caracteres
              </div>
            </div>

            <Input
              label="Referencia (opcional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="ej: cuenta-principal, sucursal-norte"
              help="Identificador interno para diferenciar subcuentas"
            />

            {/* Error del servidor */}
            {error && (
              <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
                <div>{error}</div>

                {/* Botón para abrir el registro de comercio si ese fue el problema */}
                {error.includes("no está registrado") && (
                  <button
                    onClick={() => setShowMerchantRegister(true)}
                    style={{ marginTop: "10px", padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}
                  >
                    Registrar mi comercio ahora
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ── Modal anidado: registro del comercio en Bre-B ── */}
      <RegisterBrebMerchantModal
        isOpen={showMerchantRegister}
        onClose={() => setShowMerchantRegister(false)}
        onToast={onToast}
        onSuccess={() => {
          setShowMerchantRegister(false);
          setError(null);
          onToast("info", "Comercio registrado", "Ahora intenta crear tu llave nuevamente");
        }}
      />
    </>
  );
};