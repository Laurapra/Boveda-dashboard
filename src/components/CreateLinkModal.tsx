// src/components/CreateLinkModal.tsx
import React, { useState, useEffect, useCallback } from "react";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { createPaymentLink, createPaymentQR, getVirtualKeys, getPaymentMethods } from "../lib/bepayClient";
import type { ToastType } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

type Tab = "link" | "qr";
type Step = "form" | "result";

interface VirtualKey {
  id: string;
  key_value: string;
  reference: string | null;
  status: string;
}

interface GenResult {
  type: Tab;
  url: string | null;
  qrImage: string | null;
  code: string;
  amount: number | null;
  concept: string;
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

const METHOD_LABELS: { key: string; label: string }[] = [
  { key: "pse", label: "PSE" },
  { key: "nequi_push", label: "Nequi" },
  { key: "movii_breb_qr", label: "Bre-B" },
  { key: "visa", label: "Visa" },
  { key: "mastercard", label: "Mastercard" },
];

export const CreateLinkModal: React.FC<Props> = ({ isOpen, onClose, onToast }) => {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("link");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [keys, setKeys] = useState<VirtualKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");

  const [blocked, setBlocked] = useState<string | null>(null);

  const [activeMethods, setActiveMethods] = useState<Record<string, boolean>>({});
  const [methodsLoading, setMethodsLoading] = useState(false);

  const [amountRaw, setAmountRaw] = useState("");
  const [concept, setConcept] = useState("");

  const amount = Number(amountRaw.replace(/\D/g, "")) || null;

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await getVirtualKeys();
      const list = Array.isArray(res && res.data) ? res.data : [];
      const active = list.filter(function (k: VirtualKey) {
        return k.status === "ACTIVE";
      });
      setKeys(active);
    } catch (err) {
      setKeys([]);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  const loadMethods = useCallback(async () => {
    setMethodsLoading(true);
    try {
      const res = await getPaymentMethods();
      if (res && res.success && res.data) {
        setActiveMethods(res.data);
      } else {
        setActiveMethods({});
      }
    } catch (err) {
      setActiveMethods({});
    } finally {
      setMethodsLoading(false);
    }
  }, []);

  const checkOnboarding = useCallback(async () => {
    if (!user) return;
    if (user.role === "admin") {
      setBlocked(null);
      return;
    }

    const pnRes = await supabase.from("onboarding_pn").select("status").eq("user_id", user.id).single();
    const empRes = await supabase.from("onboarding_emp").select("status").eq("user_id", user.id).single();
    const ob = pnRes.data || empRes.data;

    if (!ob) {
      setBlocked("Debes completar el Onboarding Bre-B antes de generar cobros.");
    } else if (ob.status !== "approved") {
      if (ob.status === "pending") {
        setBlocked("Tu onboarding esta pendiente de aprobacion.");
      } else if (ob.status === "in_review") {
        setBlocked("Tu onboarding esta en revision.");
      } else {
        setBlocked("Tu onboarding fue rechazado. Envia uno nuevo.");
      }
    } else {
      setBlocked(null);
    }
  }, [user]);

  useEffect(() => {
    if (!isOpen) return;
    setStep("form");
    setResult(null);
    loadKeys();
    loadMethods();
    checkOnboarding();
  }, [isOpen, loadKeys, loadMethods, checkOnboarding]);

  const handleAmountChange = (v: string) => {
    const clean = v.replace(/\D/g, "");
    setAmountRaw(clean ? Number(clean).toLocaleString("es-CO") : "");
  };

  const handleGenerate = async () => {
    if (!concept.trim()) return;
    setLoading(true);

    try {
      const response = tab === "link"
        ? await createPaymentLink(amount || 0, concept.trim(), selectedKey || undefined)
        : await createPaymentQR(amount || 0, concept.trim(), selectedKey || undefined);

      if (response && response.success === false) {
        const msg = response.error || response.message || "Intentalo de nuevo";
        onToast("error", "Bepay rechazo la solicitud", String(msg));
        return;
      }

      const data = response.data || {};
      const ide = data.ide;
      const link = data.link;
      const finalQr = data.qr || data.qrImage || null;

      if (tab === "link") {
        await supabase.from("payment_links").insert({
          user_id: user ? user.id : null,
          code: ide,
          url: link,
          amount: amount,
          concept: concept.trim(),
          methods: JSON.stringify(activeMethods),
          status: "active",
        });
      }

      setResult({
        type: tab,
        url: link || null,
        qrImage: finalQr,
        code: ide,
        amount: amount,
        concept: concept.trim(),
      });
      setStep("result");
      onToast("ok", tab === "link" ? "Link creado" : "QR generado", ide);
    } catch (err: any) {
      onToast("error", "Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result || !result.url) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(function () {
      setCopied(false);
    }, 2000);
    onToast("ok", "Copiado", result.url);
  };

  const handleClose = () => {
    setStep("form");
    setTab("link");
    setAmountRaw("");
    setConcept("");
    setSelectedKey("");
    setResult(null);
    setCopied(false);
    onClose();
  };

  const handleShareWhatsApp = () => {
    if (!result || !result.url) return;
    const text = "Hola, aqui tu link de pago: " + result.url;
    const waUrl = "https://wa.me/?text=" + encodeURIComponent(text);
    window.open(waUrl, "_blank");
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

  const downloadName = result ? "qr-" + result.code + ".png" : "qr.png";

  const linkTabStyle: React.CSSProperties = {
    flex: 1,
    padding: "8px",
    borderRadius: "7px",
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "13px",
    background: tab === "link" ? "var(--accent)" : "transparent",
    color: tab === "link" ? "#fff" : "var(--t2)",
    transition: ".14s",
  };

  const qrTabStyle: React.CSSProperties = {
    flex: 1,
    padding: "8px",
    borderRadius: "7px",
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "13px",
    background: tab === "qr" ? "var(--accent)" : "transparent",
    color: tab === "qr" ? "#fff" : "var(--t2)",
    transition: ".14s",
  };

  const whatsappButtonStyle: React.CSSProperties = {
    flex: 1,
    padding: "10px",
    background: "#1FA855",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
  };

  const downloadQrStyle: React.CSSProperties = {
    flex: 1,
    padding: "10px",
    background: "var(--surface)",
    color: "var(--t1)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
    textAlign: "center",
    textDecoration: "none",
    display: "block",
  };

  const activeMethodCount = METHOD_LABELS.filter(function (m) {
    return activeMethods[m.key] === true;
  }).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={tab === "link" ? "Crear Link de Pago" : "Generar QR de Pago"}
      subtitle="Genera un cobro y compartelo con tu cliente"
      maxWidth={520}
      footer={
        step === "form" ? (
          <React.Fragment>
            <button
              onClick={handleClose}
              style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              disabled={!concept.trim() || loading || !!blocked}
              style={{
                padding: "9px 16px",
                borderRadius: "var(--radius-sm)",
                background: "var(--accent)",
                color: "#fff",
                fontWeight: 600,
                border: "none",
                cursor: concept.trim() && !loading && !blocked ? "pointer" : "not-allowed",
                opacity: concept.trim() && !loading && !blocked ? 1 : 0.5,
              }}
            >
              {loading ? "Generando..." : tab === "link" ? "Generar link" : "Generar QR"}
            </button>
          </React.Fragment>
        ) : (
          <button
            onClick={handleClose}
            style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            Listo
          </button>
        )
      }
    >
      {step === "form" ? (
        <React.Fragment>
          <div style={{ display: "flex", gap: "6px", padding: "4px", background: "var(--elevated)", borderRadius: "var(--radius-sm)", marginBottom: "4px" }}>
            <button onClick={function () { setTab("link"); }} style={linkTabStyle}>
              Link de pago
            </button>
            <button onClick={function () { setTab("qr"); }} style={qrTabStyle}>
              Codigo QR
            </button>
          </div>

          {blocked ? (
            <div style={{ padding: "12px 14px", background: "var(--warning-dim)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--warning)" }}>
              {blocked}
            </div>
          ) : null}

          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>
              Llave para identificar el cobro (opcional)
            </label>
            <select
              value={selectedKey}
              onChange={function (e) { setSelectedKey(e.target.value); }}
              style={inputStyle}
              disabled={keysLoading}
            >
              <option value="">{keysLoading ? "Cargando llaves..." : "Sin llave - cobro generico"}</option>
              {keys.map(function (k) {
                const label = k.reference ? "@" + k.key_value + " (" + k.reference + ")" : "@" + k.key_value;
                return (
                  <option key={k.id} value={k.key_value}>
                    {label}
                  </option>
                );
              })}
            </select>
            {keys.length === 0 && !keysLoading ? (
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>
                No tienes llaves creadas. Ve a Registrar llave para crear una y organizar tus cobros.
              </div>
            ) : null}
          </div>

          <Input
            label="Monto"
            prefix="$"
            placeholder="150.000"
            inputMode="numeric"
            value={amountRaw}
            onChange={function (e) { handleAmountChange(e.target.value); }}
            help="Minimo $1.000 COP"
          />

          <Input
            label="Concepto"
            required
            placeholder="Venta - orden 8842"
            value={concept}
            onChange={function (e) { setConcept(e.target.value); }}
          />

          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "8px" }}>
              Metodos disponibles en tu cuenta {methodsLoading ? "" : "(" + activeMethodCount + " activos)"}
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {methodsLoading ? (
                <span style={{ fontSize: "12.5px", color: "var(--t3)" }}>Consultando metodos habilitados...</span>
              ) : (
                METHOD_LABELS.map(function (m) {
                  const active = activeMethods[m.key] === true;
                  const chipStyle: React.CSSProperties = {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid " + (active ? "var(--success)" : "var(--border)"),
                    background: active ? "var(--success-dim)" : "var(--elevated)",
                    color: active ? "var(--success)" : "var(--t3)",
                    fontWeight: 600,
                    fontSize: "12.5px",
                  };
                  return (
                    <span key={m.key} style={chipStyle}>
                      {active ? "\u2713" : "\u2715"} {m.label}
                    </span>
                  );
                })
              )}
            </div>
            <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>
              Estos son los métodos disponibles al momento.
            </div>
          </div>
        </React.Fragment>
      ) : result ? (
        <React.Fragment>
          <div style={{ padding: "16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={{ width: "90px", height: "90px", background: "#fff", borderRadius: "8px", padding: "6px", flexShrink: 0, display: "grid", placeItems: "center", overflow: "hidden" }}>
              {result.qrImage ? (
                <img src={result.qrImage} alt="QR de pago" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#0B0D12" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <path d="M14 14h3v3h-3zM19 14v7M14 19h5" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "var(--success-dim)", color: "var(--success)" }}>
                {"\u25CF "}{result.type === "link" ? "Link activo" : "QR activo"}
              </span>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>
                {result.amount ? fmtCOP(result.amount) : "Monto abierto"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>{result.concept}</div>
              <div style={{ fontSize: "10.5px", color: "var(--t3)", marginTop: "4px", fontFamily: "var(--mono)" }}>
                ID: {result.code}
              </div>
            </div>
          </div>

          {result.url ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
              <code style={{ fontFamily: "var(--mono)", fontSize: "12.5px", color: "var(--accent)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {result.url}
              </code>
              <button
                onClick={handleCopy}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  background: copied ? "var(--success-dim)" : "var(--surface)",
                  color: copied ? "var(--success)" : "var(--t2)",
                  border: "1px solid var(--border)",
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: ".14s",
                  flexShrink: 0,
                }}
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "8px" }}>
            {result.url ? (
              <button onClick={handleShareWhatsApp} style={whatsappButtonStyle}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M12 2a10 10 0 00-8.7 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2zm4.5 12c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.1-.5 0a6.5 6.5 0 01-1.9-1.2 7.2 7.2 0 01-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4c0-.1-.5-1.3-.7-1.8s-.4-.4-.5-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2c0 1.3.9 2.5 1 2.7s1.9 2.9 4.6 4c1.6.7 2.2.8 3 .6.5-.1 1.4-.6 1.6-1.1s.2-1 .1-1.1l-.4-.2z" />
                </svg>
                WhatsApp
              </button>
            ) : null}
            {result.qrImage ? (
              <a href={result.qrImage} download={downloadName} style={downloadQrStyle}>
                Descargar QR
              </a>
            ) : null}
          </div>
        </React.Fragment>
      ) : null}
    </Modal>
  );
};