// src/pages/Dispersion.tsx
import React, { useState, useRef } from "react";
import Papa from "papaparse";
//import { useAuthStore } from "../store/authStore";
import type { ToastType } from "../types";
import {lookupBrebKey, sendPayoutBreb} from "../lib/bepayClient";

// ── Tipos internos ───────────────────────────────────────────────
interface ValidatedRow {
  index: number;
  method: string;
  llave: string;
  monto: number;
  concepto: string;
  status: "ok" | "error";
  errors: string[];
}


interface SharedProps {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}


function IndividualTab({ fmt, onToast }: SharedProps) {
  const [key, setKey]                   = useState("");
  const [amount, setAmount]             = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [lookupState, setLookupState]   = useState<"idle" | "loading" | "ok">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sending, setSending] = useState(false);

  const NAMES = [
    "MARÍA F***** GÓMEZ", "JUAN D***** RAMÍREZ",
    "LAURA C***** TORRES", "ANDRÉS M***** SOTO",
  ];

  const handleKeyChange = (v: string) => {
  setKey(v);
  setResolvedName(null);
  setLookupState("idle");
  if (timerRef.current) clearTimeout(timerRef.current);
  if (v.trim().length < 5) return;

  setLookupState("loading");
  timerRef.current = setTimeout(async () => {
    try {
      const res = await lookupBrebKey(v.trim());
      console.log("lookup respuesta:", res);

      if (res?.success && res.data?.name) {
        setResolvedName(res.data.name);
        setLookupState("ok");
      } else {
        setLookupState("idle");
        setResolvedName(null);
      }
    } catch (err) {
      console.error("lookup error:", err);
      setLookupState("idle");
    }
  }, 600);
};


  const handleAmountChange = (v: string) => {
    const clean = v.replace(/\D/g, "");
    setAmount(clean ? Number(clean).toLocaleString("es-CO") : "");
  };

  const rawAmount = Number(amount.replace(/\D/g, "")) || 0;
  const fee       = Math.round(rawAmount * 0.012);
  const total     = rawAmount + fee;
  const canSend   = rawAmount > 0 && resolvedName !== null;

  const handleSend = async () => {
  if (!canSend || !resolvedName) return;
  setSending(true); // agrega este estado si no lo tienes: const [sending, setSending] = useState(false);

  try {
    const reference = `BOV-${Date.now()}`;
    const res = await sendPayoutBreb(key, rawAmount, "Dispersión Bóveda", reference);

    if (res?.success === false) {
      onToast("error", "Dispersión rechazada", typeof res.message === "string" ? res.message : JSON.stringify(res.message));
      return;
    }

    onToast("ok", "Dispersión enviada", `${fmt(rawAmount)} → ${resolvedName}`);
    setKey(""); setAmount(""); setResolvedName(null); setLookupState("idle");
  } catch (err: any) {
    onToast("error", "Error en dispersión", err.message);
  } finally {
    setSending(false);
  }
};


  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px",
    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    background: "var(--bg)", color: "var(--t1)",
    fontSize: "13.5px", outline: "none", transition: "border-color .14s, box-shadow .14s",
  };

  const focusInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "var(--accent)";
    e.target.style.boxShadow  = "0 0 0 3px var(--accent-ring)";
  };
  const blurInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "var(--border)";
    e.target.style.boxShadow  = "none";
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: "16px" }}>
      {/* Formulario */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--shadow)" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "20px" }}>Nueva dispersión</h3>

        {/* Llave de destino */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", marginBottom: "7px" }}>
            Llave de destino <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <input
            value={key}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="Celular, cédula, correo o @llave"
            style={inputStyle}
            onFocus={focusInput}
            onBlur={blurInput}
          />

          {/* Estado lookup */}
          {lookupState === "loading" && (
            <div style={{ marginTop: "6px", padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--elevated)", color: "var(--t2)", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
              Validando titular en directorio Bre-B…
            </div>
          )}
          {lookupState === "ok" && (
            <div style={{ marginTop: "6px", padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--success-dim)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)", color: "var(--success)", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "8px" }}>
              ✓ Titular verificado: <b>{resolvedName}</b>
            </div>
          )}
        </div>

        {/* Monto, referencia y concepto */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", marginBottom: "7px" }}>
              Monto <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontWeight: 600, pointerEvents: "none" }}>$</span>
              <input
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                style={{ ...inputStyle, paddingLeft: "26px" }}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", marginBottom: "7px" }}>Referencia</label>
            <input placeholder="PO-8842" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", marginBottom: "7px" }}>Concepto</label>
            <input placeholder="Liquidación orden P2P #8842" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "16px" }}>Resumen</h3>
        <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 16px", flex: 1 }}>
          {[
            { k: "Monto a enviar",     v: fmt(rawAmount),    green: false },
            { k: "Comisión (1.2%)",    v: fmt(fee),          green: false },
            { k: "Titular verificado", v: resolvedName ?? "—", green: !!resolvedName },
          ].map((r) => (
            <div key={r.k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: "13px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--t2)" }}>{r.k}</span>
              <b style={{ color: r.green ? "var(--success)" : undefined, fontVariantNumeric: "tabular-nums" }}>{r.v}</b>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0 0", fontSize: "15px", fontWeight: 700 }}>
            <span style={{ color: "var(--t2)" }}>Total débito</span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</b>
          </div>
        </div>
        <p style={{ fontSize: "11.5px", color: "var(--t3)", margin: "14px 0" }}>
          Montos sobre $2.000.000 requieren verificación 2FA.
        </p>
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            width: "100%", padding: "12px",
            background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: "var(--radius-sm)",
            fontWeight: 700, fontSize: "14px",
            cursor: canSend ? "pointer" : "not-allowed",
            opacity: canSend ? 1 : 0.45, transition: "opacity .14s",
          }}
        >
          Enviar dispersión
        </button>
      </div>
    </div>
  );
}

// ================================================================
//  TAB MASIVA
// ================================================================
function BulkTab({ fmt, onToast }: SharedProps) {
  const [rows, setRows]         = useState<ValidatedRow[]>([]);
  const [isDragging, setIsDrag] = useState(false);
  const [processing, setProc]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const VALID_METHODS = ["Bre-B", "Nequi", "Link"];

  // Ahora row: Record<string, string> — sin any implícito
  const validateRow = (row: Record<string, string>, index: number): ValidatedRow => {
    const errors: string[] = [];
    if (!VALID_METHODS.includes(row.method))     errors.push("método inválido");
    if (!row.llave?.trim())                       errors.push("llave vacía");
    if (!row.monto || isNaN(Number(row.monto)))  errors.push("monto inválido");
    if (!row.concepto?.trim())                    errors.push("concepto vacío");
    return {
      index:    index + 1,
      method:   row.method ?? "",
      llave:    row.llave ?? "",
      monto:    Number(row.monto) || 0,
      concepto: row.concepto ?? "",
      status:   errors.length === 0 ? "ok" : "error",
      errors,
    };
  };

  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const validated = result.data.map((row, i) => validateRow(row, i));
        setRows(validated);
        const valid = validated.filter((r) => r.status === "ok").length;
        onToast("info", "Archivo cargado", `${validated.length} filas · ${valid} válidas`);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const validRows   = rows.filter((r) => r.status === "ok");
  const errorRows   = rows.filter((r) => r.status === "error");
  const totalAmount = validRows.reduce((sum, r) => sum + r.monto, 0);

  const handleProcess = async () => {
    if (validRows.length === 0) return;
    setProc(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    onToast("ok", "Lote procesado", `${validRows.length} dispersiones enviadas`);
    setRows([]);
    setProc(false);
  };

  const downloadTemplate = () => {
    const csv  = "method,llave,monto,concepto\nBre-B,@ejemplo,150000,Pago orden #001\nNequi,3001234567,80000,Liquidación P2P";
    const blob = new Blob([csv], { type: "text/csv" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "plantilla_boveda.csv";
    a.click();
    URL.revokeObjectURL(a.href); // limpia memoria
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--shadow)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Dispersión masiva</h3>
          <p style={{ fontSize: "12.5px", color: "var(--t3)" }}>
            Carga un CSV con columnas:{" "}
            <code style={{ fontFamily: "var(--mono)", background: "var(--elevated)", padding: "1px 5px", borderRadius: "4px" }}>
              method, llave, monto, concepto
            </code>
          </p>
        </div>
        <button onClick={downloadTemplate} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}>
          Descargar plantilla
        </button>
      </div>

      {/* Dropzone — solo visible cuando no hay filas cargadas */}
      {rows.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
          onDragLeave={() => setIsDrag(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${isDragging ? "var(--accent)" : "var(--border-strong)"}`,
            borderRadius: "var(--radius)", padding: "40px", textAlign: "center",
            background: isDragging ? "var(--accent-dim)" : "var(--bg)",
            cursor: "pointer", transition: ".14s",
          }}
        >
          <div style={{ width: "48px", height: "48px", borderRadius: "13px", background: "var(--accent-dim)", color: "var(--accent)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "5px" }}>Arrastra tu CSV o haz clic para subir</div>
          <div style={{ color: "var(--t3)", fontSize: "12.5px" }}>Máximo 5.000 filas · columnas: method, llave, monto, concepto</div>
          <input
            ref={fileRef} type="file" accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
        </div>
      )}

      {/* Resultados */}
      {rows.length > 0 && (
        <>
          {/* Tarjetas resumen */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "16px" }}>
            {[
              { label: "Total filas",    value: rows.length,      color: "var(--t1)" },
              { label: "Válidas",        value: validRows.length, color: "var(--success)" },
              { label: "Con errores",    value: errorRows.length, color: "var(--error)" },
              { label: "Total a enviar", value: fmt(totalAmount), color: "var(--accent)" },
            ].map((s) => (
              <div key={s.label} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--elevated)" }}>
                <div style={{ fontSize: "20px", fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                <div style={{ fontSize: "11.5px", color: "var(--t2)", marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabla preview */}
          <div style={{ overflowX: "auto", maxHeight: "260px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["#", "Método", "Llave", "Monto", "Concepto", "Estado"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 14px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--t3)", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.index} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 14px", color: "var(--t3)", fontFamily: "var(--mono)", fontSize: "12px" }}>{row.index}</td>
                    <td style={{ padding: "10px 14px" }}>{row.method}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--mono)", fontSize: "12px" }}>{row.llave}</td>
                    <td style={{ padding: "10px 14px", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{row.monto ? fmt(row.monto) : "—"}</td>
                    <td style={{ padding: "10px 14px", color: "var(--t2)" }}>{row.concepto}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {row.status === "ok"
                        ? <span style={{ color: "var(--success)", fontWeight: 600, fontSize: "12px" }}>✓ Válida</span>
                        : <span style={{ color: "var(--error)", fontWeight: 600, fontSize: "12px" }} title={row.errors.join(", ")}>✗ {row.errors[0]}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Botones de acción */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ fontSize: "13px", color: "var(--t2)" }}>
              Se procesarán <b style={{ color: "var(--t1)" }}>{validRows.length}</b> pagos por{" "}
              <b style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{fmt(totalAmount)}</b>
            </div>
            <div style={{ display: "flex", gap: "9px" }}>
              <button
                onClick={() => setRows([])}
                style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleProcess}
                disabled={validRows.length === 0 || processing}
                style={{ padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer", opacity: validRows.length === 0 ? 0.5 : 1 }}
              >
                {processing ? "Procesando…" : `Procesar ${validRows.length} pagos`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ================================================================
//  COMPONENTE PRINCIPAL
// ================================================================
export const DispersionView: React.FC<SharedProps> = ({ fmt, onToast }) => {
  const [activeTab, setActiveTab] = useState<"ind" | "bulk">("ind");

  const tabBtn = (key: "ind" | "bulk", label: string) => (
    <button
      onClick={() => setActiveTab(key)}
      style={{
        padding: "8px 16px", fontSize: "13px", fontWeight: 600,
        borderRadius: "8px", border: "none", cursor: "pointer",
        transition: ".12s",
        color:      activeTab === key ? "var(--t1)"      : "var(--t2)",
        background: activeTab === key ? "var(--surface)" : "transparent",
        boxShadow:  activeTab === key ? "0 1px 4px rgba(0,0,0,.3)" : "none",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px" }}>Dispersión</h1>
        <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>
          Envía fondos a llaves Bre-B o cuentas Nequi · con validación previa de titular
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", background: "var(--elevated)", padding: "4px", borderRadius: "var(--radius-sm)", width: "fit-content", marginBottom: "18px" }}>
        {tabBtn("ind",  "Individual")}
        {tabBtn("bulk", "Masiva (CSV)")}
      </div>

      {/* Contenido del tab activo */}
      {activeTab === "ind"
        ? <IndividualTab fmt={fmt} onToast={onToast} />
        : <BulkTab       fmt={fmt} onToast={onToast} />
      }
    </div>
  );
};