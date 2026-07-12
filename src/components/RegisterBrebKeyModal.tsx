// src/components/RegisterBrebKeyModal.tsx
import React, { useState, useEffect, useCallback } from "react";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { generateBrebKey } from "../lib/keyGenerator";
import { useAuthStore } from "../store/authStore";
import { createVirtualKey, getVirtualKeys, deactivateVirtualKey } from "../lib/bepayClient";
import type { ToastType } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

interface VirtualKey {
  id: string;
  key_value: string;
  reference: string | null;
  status: string;
  total_received: number;
}

type Step = "list" | "create";

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export const RegisterBrebKeyModal: React.FC<Props> = ({ isOpen, onClose, onToast }) => {
  const { user } = useAuthStore();

  const [step,    setStep]    = useState<Step>("list");
  const [keys,    setKeys]    = useState<VirtualKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [reference,  setReference]  = useState("");
  const [nextSeq,    setNextSeq]    = useState(1);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getVirtualKeys();
      const data = Array.isArray(res?.data) ? res.data : [];
      setKeys(data);
      setNextSeq(data.length + 1);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setStep("list");
    setError(null);
    fetchKeys();
  }, [isOpen, fetchKeys]);

  const handleClose = () => {
    setStep("list");
    setReference("");
    setError(null);
    onClose();
  };

  const previewKey = user ? generateBrebKey(user.id, nextSeq) : "";

  const handleCreate = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createVirtualKey(reference || undefined);

      if (res?.success === false) {
        setError(res.error ?? "No se pudo crear la llave");
        return;
      }

      // Usa la llave REAL devuelta por el backend, no el preview
      const created = res.data?.key_value ?? previewKey;
      onToast("ok", "Llave creada", `@${created} lista para recibir pagos`);
      setReference("");
      await fetchKeys();
      setStep("list");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (keyId: string, keyValue: string) => {
    if (!confirm(`¿Desactivar la llave @${keyValue}?`)) return;
    try {
      await deactivateVirtualKey(keyId);
      onToast("ok", "Llave desactivada", `@${keyValue}`);
      await fetchKeys();
    } catch (err: any) {
      onToast("error", "Error", err.message);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    onToast("ok", "Copiado", `@${key}`);
  };

  const statusChip = (status: string) => {
    const cfg: Record<string, { color: string; bg: string; label: string }> = {
      ACTIVE:   { color: "var(--success)", bg: "var(--success-dim)", label: "Activa" },
      INACTIVE: { color: "var(--t3)",      bg: "var(--elevated)",    label: "Inactiva" },
    };
    const c = cfg[status] ?? { color: "var(--t3)", bg: "var(--elevated)", label: status };
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, color: c.color, background: c.bg }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.color }} />
        {c.label}
      </span>
    );
  };

  const userPart = user?.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase() ?? "";
  const seqPart  = String(nextSeq).padStart(2, "0");

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === "list" ? "Mis llaves de cobro" : "Nueva llave"}
      subtitle={
        step === "list"
          ? "Referencias internas para identificar tus pagos"
          : "Se genera automáticamente con tu ID de usuario"
      }
      maxWidth={520}
      footer={
        step === "list" ? (
          <>
            <button onClick={handleClose} style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>
              Cerrar
            </button>
            <button onClick={() => setStep("create")} style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: "pointer" }}>
              + Nueva llave
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setStep("list"); setError(null); }} style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>
              ← Volver
            </button>
            <button onClick={handleCreate} disabled={saving} style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Creando…" : "Crear llave"}
            </button>
          </>
        )
      }
    >
      {step === "list" && (
        <>
          <div style={{ padding: "12px 14px", background: "var(--accent-dim)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)", lineHeight: 1.6, marginBottom: "14px" }}>
            Estas llaves son referencias internas de tu cuenta. Los pagos se acreditan a la cuenta principal y cada llave te permite identificar tus propios cobros.
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "32px", color: "var(--t3)" }}>Cargando…</div>
          ) : keys.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px" }}>
              <div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--t1)" }}>Sin llaves creadas</div>
              <div style={{ fontSize: "12.5px", color: "var(--t3)" }}>Crea tu primera llave para empezar a identificar tus cobros</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {keys.map((k) => (
                <div key={k.id} style={{ padding: "14px 16px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <code style={{ fontFamily: "var(--mono)", fontSize: "15px", fontWeight: 700, color: "var(--accent)" }}>
                      @{k.key_value}
                    </code>
                    {statusChip(k.status)}
                  </div>
                  {k.reference && (
                    <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "6px" }}>Ref: {k.reference}</div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "var(--t2)" }}>
                    <span>Total recibido: <b>{fmtCOP(k.total_received ?? 0)}</b></span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => copyKey(k.key_value)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", color: "var(--t2)", fontSize: "11px" }}>
                        Copiar
                      </button>
                      {k.status === "ACTIVE" && (
                        <button onClick={() => handleDeactivate(k.id, k.key_value)} style={{ background: "none", border: "1px solid var(--error)", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", color: "var(--error)", fontSize: "11px" }}>
                          Desactivar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {step === "create" && (
        <>
          <div style={{ padding: "12px 14px", background: "var(--accent-dim)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)", lineHeight: 1.6 }}>
            <b style={{ color: "var(--accent)" }}>Generación automática</b> — La llave se construye con el prefijo{" "}
            <code style={{ fontFamily: "var(--mono)", background: "var(--elevated)", padding: "1px 5px", borderRadius: "4px" }}>rmpx</code>
            {" "}+ tus primeros 6 caracteres de usuario + consecutivo.
          </div>

          <div style={{ padding: "16px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "8px" }}>
              Vista previa (puede variar levemente al confirmar)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <code style={{ fontFamily: "var(--mono)", fontSize: "20px", fontWeight: 700, color: "var(--accent)", letterSpacing: "1px" }}>
                @{previewKey}
              </code>
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
              {[
                { label: "Prefijo",     value: "rmpx",    color: "var(--accent)" },
                { label: "ID usuario",  value: userPart,  color: "var(--info)" },
                { label: "Consecutivo", value: seqPart,   color: "var(--success)" },
              ].map(part => (
                <div key={part.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                  <code style={{ fontFamily: "var(--mono)", fontSize: "14px", fontWeight: 700, color: part.color, padding: "4px 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                    {part.value}
                  </code>
                  <span style={{ fontSize: "10px", color: "var(--t3)" }}>{part.label}</span>
                </div>
              ))}
            </div>
          </div>

          <Input
            label="Referencia (opcional)"
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="ej: cuenta-principal, sucursal-norte"
            help="Identificador interno para diferenciar tus llaves"
          />

          {error && (
            <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
              {error}
            </div>
          )}
        </>
      )}
    </Modal>
  );
};