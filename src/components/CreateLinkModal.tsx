// src/components/CreateLinkModal.tsx
import React, { useState } from "react";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import type { ToastType } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// Paso 1: formulario | Paso 2: link generado
type Step = "form" | "result";

interface LinkResult {
  url: string;
  code: string;
  amount: number | null;
  concept: string;
}

function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const CreateLinkModal: React.FC<Props> = ({ isOpen, onClose, onToast }) => {
  const { user } = useAuthStore();
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LinkResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Campos del formulario
  const [amountRaw, setAmountRaw] = useState("");
  const [concept, setConcept]     = useState("");
  const [expiry, setExpiry]       = useState("1 hora");
  const [methods, setMethods]     = useState({ breb: true, nequi: true, card: false });

  const amount = Number(amountRaw.replace(/\D/g, "")) || null;

  const handleAmountChange = (v: string) => {
    const clean = v.replace(/\D/g, "");
    setAmountRaw(clean ? Number(clean).toLocaleString("es-CO") : "");
  };

  const toggleMethod = (key: keyof typeof methods) => {
    setMethods((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGenerate = async () => {
    if (!concept.trim()) return;
    setLoading(true);

    try {
      const code = generateCode();
      const url  = `https://pay.boveda.co/l/${code}`;

      // Guardar el link en Supabase
      // (necesitarás crear la tabla payment_links — SQL abajo)
      const { error } = await supabase.from("payment_links").insert({
        user_id:    user?.id,
        code,
        url,
        amount,
        concept:    concept.trim(),
        expiry,
        methods:    JSON.stringify(methods),
        status:     "active",
      });

      if (error) throw error;

      setResult({ url, code, amount, concept: concept.trim() });
      setStep("result");
      onToast("ok", "Link creado", `Cobro ${amount ? `$${amount.toLocaleString("es-CO")}` : "abierto"} listo`);
    } catch (err: any) {
      onToast("error", "Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onToast("ok", "Copiado", result.url);
  };

  const handleClose = () => {
    // Resetear todo al cerrar
    setStep("form");
    setAmountRaw(""); setConcept(""); setExpiry("1 hora");
    setMethods({ breb: true, nequi: true, card: false });
    setResult(null); setCopied(false);
    onClose();
  };

  const COP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px",
    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none",
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Crear Link de Pago"
      subtitle="Genera un cobro y compártelo con tu cliente"
      maxWidth={520}
      footer={
        step === "form" ? (
          <>
            <button onClick={handleClose} style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              disabled={!concept.trim() || loading}
              style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: concept.trim() && !loading ? "pointer" : "not-allowed", opacity: concept.trim() && !loading ? 1 : 0.5 }}
            >
              {loading ? "Generando…" : "Generar link"}
            </button>
          </>
        ) : (
          <button onClick={handleClose} style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: "pointer" }}>
            Listo
          </button>
        )
      }
    >
      {step === "form" ? (
        <>
          {/* Monto y expiración */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Input
              label="Monto" prefix="$"
              placeholder="150.000" inputMode="numeric"
              value={amountRaw} onChange={(e) => handleAmountChange(e.target.value)}
              help="Deja vacío para monto abierto"
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)" }}>Expiración</label>
              <select
                value={expiry} onChange={(e) => setExpiry(e.target.value)}
                style={{ ...inputStyle }}
              >
                <option>15 minutos</option>
                <option>1 hora</option>
                <option>24 horas</option>
                <option>7 días</option>
              </select>
            </div>
          </div>

          {/* Concepto */}
          <Input
            label="Concepto" required
            placeholder="Venta USDT — orden #8842"
            value={concept} onChange={(e) => setConcept(e.target.value)}
          />

          {/* Métodos habilitados */}
          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "8px" }}>
              Métodos habilitados
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { key: "breb"  as const, label: "Bre-B" },
                { key: "nequi" as const, label: "Nequi" },
                { key: "card"  as const, label: "Tarjeta / PSE" },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => toggleMethod(m.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: "7px",
                    padding: "8px 12px", borderRadius: "var(--radius-sm)",
                    border: `1.5px solid ${methods[m.key] ? "var(--accent)" : "var(--border)"}`,
                    background: methods[m.key] ? "var(--accent-dim)" : "transparent",
                    color: methods[m.key] ? "var(--accent)" : "var(--t2)",
                    fontWeight: 600, fontSize: "13px", cursor: "pointer", transition: ".14s",
                  }}
                >
                  {methods[m.key] && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : result ? (
        <>
          {/* Resultado: link generado */}
          <div style={{ padding: "16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", gap: "16px", alignItems: "center" }}>
            {/* QR decorativo */}
            <div style={{ width: "80px", height: "80px", background: "#fff", borderRadius: "8px", padding: "6px", flexShrink: 0, display: "grid", placeItems: "center" }}>
              <svg viewBox="0 0 21 21" width="68" height="68">
                {/* Patrón QR simplificado decorativo */}
                {[0,1,2,3,4,5,6].map(x => [0,1,2,3,4,5,6].map(y => {
                  const finder = (x<7&&y<7)||(x>=14&&y<7)||(x<7&&y>=14);
                  const on = finder
                    ? (x===0||x===6||y===0||y===6||(x>1&&x<5&&y>1&&y<5))
                    : Math.random() > 0.5;
                  return on ? <rect key={`${x}-${y}`} x={x*3} y={y*3} width="3" height="3" fill="#0B0D12" /> : null;
                }))}
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "var(--success-dim)", color: "var(--success)" }}>
                ● Link activo
              </span>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>
                {result.amount ? COP(result.amount) : "Monto abierto"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>{result.concept}</div>
            </div>
          </div>

          {/* URL copiable */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
            <code style={{ fontFamily: "var(--mono)", fontSize: "12.5px", color: "var(--accent)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {result.url}
            </code>
            <button
              onClick={handleCopy}
              style={{ padding: "5px 10px", borderRadius: "6px", background: copied ? "var(--success-dim)" : "var(--surface)", color: copied ? "var(--success)" : "var(--t2)", border: "1px solid var(--border)", fontWeight: 600, fontSize: "12px", cursor: "pointer", transition: ".14s", flexShrink: 0 }}
            >
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>

          {/* Botones de compartir */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Hola, aquí tu link de pago: ${result.url}`)}`, "_blank")}
              style={{ flex: 1, padding: "10px", background: "#1FA855", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M12 2a10 10 0 00-8.7 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2zm4.5 12c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.1-.5 0a6.5 6.5 0 01-1.9-1.2 7.2 7.2 0 01-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4c0-.1-.5-1.3-.7-1.8s-.4-.4-.5-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2c0 1.3.9 2.5 1 2.7s1.9 2.9 4.6 4c1.6.7 2.2.8 3 .6.5-.1 1.4-.6 1.6-1.1s.2-1 .1-1.1l-.4-.2z"/>
              </svg>
              WhatsApp
            </button>
            <button
              onClick={handleCopy}
              style={{ flex: 1, padding: "10px", background: "var(--surface)", color: "var(--t1)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              Copiar link
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
};