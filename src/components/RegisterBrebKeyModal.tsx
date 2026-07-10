// src/components/RegisterBrebKeyModal.tsx
import React, { useState, useEffect } from "react";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { registerBrebKey, getBrebKeys } from "../lib/bepayClient";
import { RegisterBrebMerchantModal } from "./RegisterBrebMerchantModal";
import { generateBrebKey, getNextConsecutivo } from "../lib/keyGenerator";
import { useAuthStore } from "../store/authStore";
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
  const { user } = useAuthStore();

  const [step, setStep]               = useState<Step>("list");
  const [keys, setKeys]               = useState<BrebKey[]>([]);
  const [loadingKeys, setLoading]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showMerchantRegister, setShowMerchantRegister] = useState(false);

  // Solo referencia — la llave se genera automáticamente
  const [reference, setReference] = useState("");

  // Previsualización de la llave que se va a generar
  const [previewKey, setPreviewKey] = useState("");

  // Genera el preview cuando cambia el número de llaves o el usuario
  useEffect(() => {
    if (!user) return;
    try {
      const nextSeq = getNextConsecutivo(keys);
      const key     = generateBrebKey(user.id, nextSeq);
      setPreviewKey(key);
    } catch {
      setPreviewKey("");
    }
  }, [keys, user]);

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
    setStep("list");
    setReference("");
    setError(null);
    onClose();
  };

  const handleRegister = async () => {
  if (!user || !previewKey) return;
  setSaving(true);
  setError(null);

  try {
    console.log("Registrando llave:", previewKey);
    const res = await registerBrebKey(reference, previewKey);
    console.log("Respuesta:", JSON.stringify(res));

    if (!res) {
      setError("Sin respuesta del servidor");
      return;
    }

    if (res?.success === false) {
      const rawMsg = res.message ?? res.error ?? "Error desconocido";
      const msg = typeof rawMsg === "string"
        ? rawMsg
        : JSON.stringify(rawMsg);

      if (
        msg.toLowerCase().includes("no se encontró el usuario") ||
        msg.toLowerCase().includes("intenta registrar") ||
        msg.toLowerCase().includes("not found")
      ) {
        setError("Tu comercio no está registrado en Bre-B. Ve a 'Onboarding Bre-B' para completar el registro.");
      } else if (
        msg.toLowerCase().includes("ya está registrada") ||
        msg.toLowerCase().includes("duplicate") ||
        msg.toLowerCase().includes("already")
      ) {
        setError(`La llave @${previewKey} ya existe. Recargando...`);
        await fetchKeys();
      } else {
        setError(msg);
      }
      return;
    }

    onToast("ok", "Llave Bre-B registrada", `@${previewKey} lista para recibir pagos`);
    setReference("");
    await fetchKeys();
    setStep("list");

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error en handleRegister:", message);
    setError(message);
  } finally {
    setSaving(false);
  }
};

  // ── Chips de estado ──────────────────────────────────────────────
  const statusChip = (status: string) => {
    const cfg: Record<string, { color: string; bg: string; label: string }> = {
      ACTIVE:  { color: "var(--success)", bg: "var(--success-dim)", label: "Activa" },
      active:  { color: "var(--success)", bg: "var(--success-dim)", label: "Activa" },
      PENDING: { color: "var(--warning)", bg: "var(--warning-dim)", label: "Pendiente" },
      pending: { color: "var(--warning)", bg: "var(--warning-dim)", label: "Pendiente" },
    };
    const c = cfg[status] ?? { color: "var(--t3)", bg: "var(--elevated)", label: status };
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, color: c.color, background: c.bg }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.color }} />
        {c.label}
      </span>
    );
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
            : "La llave se genera automáticamente con tu ID de usuario"
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
                disabled={saving || !previewKey}
                style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: saving || !previewKey ? "not-allowed" : "pointer", opacity: saving || !previewKey ? 0.5 : 1 }}
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
                  Registra tu primera llave para empezar a recibir pagos
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

        {/* ── PASO 2: Confirmar y registrar ── */}
        {step === "create" && (
          <>
            {/* Info sobre la generación automática */}
            <div style={{ padding: "12px 14px", background: "var(--accent-dim)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)", lineHeight: 1.6 }}>
              <b style={{ color: "var(--accent)" }}>Generación automática</b> — La llave se construye con el prefijo <code style={{ fontFamily: "var(--mono)", background: "var(--elevated)", padding: "1px 5px", borderRadius: "4px" }}>rmpx</code> + tus primeros 6 caracteres de usuario + consecutivo.
            </div>

            {/* Preview de la llave generada */}
            <div style={{ padding: "16px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "8px" }}>
                Llave que se registrará
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <code style={{ fontFamily: "var(--mono)", fontSize: "20px", fontWeight: 700, color: "var(--accent)", letterSpacing: "1px" }}>
                  @{previewKey}
                </code>
                <span style={{ fontSize: "11px", color: "var(--t3)" }}>
                  ({previewKey.length} / 30 chars)
                </span>
              </div>

              {/* Desglose visual de la llave */}
              <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
                {[
                  { label: "Prefijo",      value: "rmpx",                               color: "var(--accent)" },
                  { label: "ID usuario",   value: user?.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase() ?? "", color: "var(--info)" },
                  { label: "Consecutivo",  value: String(getNextConsecutivo(keys)).padStart(2, "0"), color: "var(--success)" },
                ].map((part) => (
                  <div key={part.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                    <code style={{ fontFamily: "var(--mono)", fontSize: "14px", fontWeight: 700, color: part.color, padding: "4px 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                      {part.value}
                    </code>
                    <span style={{ fontSize: "10px", color: "var(--t3)" }}>{part.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Referencia opcional */}
            <Input
              label="Referencia (opcional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="ej: cuenta-principal, sucursal-norte"
              help="Identificador interno para diferenciar subcuentas"
            />

            {/* Próxima llave */}
            {keys.length > 0 && (
              <div style={{ fontSize: "11.5px", color: "var(--t3)", textAlign: "center" }}>
                Esta será tu llave #{getNextConsecutivo(keys)} · Tienes {keys.length} llave{keys.length !== 1 ? "s" : ""} registrada{keys.length !== 1 ? "s" : ""}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
                <div>{error}</div>
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

      {/* Modal anidado de onboarding */}
      <RegisterBrebMerchantModal
        isOpen={showMerchantRegister}
        onClose={() => setShowMerchantRegister(false)}
        onToast={onToast}
        onSuccess={() => {
          setShowMerchantRegister(false);
          setError(null);
          onToast("info", "Comercio registrado", "Ahora intenta registrar tu llave nuevamente");
        }}
      />
    </>
  );
};