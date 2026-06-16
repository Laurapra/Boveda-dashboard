// src/pages/EstadoCuenta.tsx
import React from "react";
import { Badge } from "../components/ui/Badge";
import { exportStatementPDF } from "../lib/exporters";
import type { ToastType } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void; // ← faltaba esto
}

const MOVIMIENTOS = [
  { date: "10 jun", concept: "Recaudo Bre-B · BRB-7F3K9A",      type: "in"  as const, amount:  480000,  fee:   5760, balance: 84320000 },
  { date: "10 jun", concept: "Dispersión Nequi · PO-8841",        type: "out" as const, amount: -1200000, fee:  14400, balance: 83840000 },
  { date: "09 jun", concept: "Liberación de garantía",            type: "in"  as const, amount:  8240000, fee:      0, balance: 85040000 },
  { date: "09 jun", concept: "Recaudo Nequi · BRB-K2M8PQ",       type: "in"  as const, amount:  250000,  fee:   3000, balance: 76800000 },
  { date: "08 jun", concept: "Dispersión masiva (lote #214)",     type: "out" as const, amount: -9300000, fee: 111600, balance: 76550000 },
  { date: "08 jun", concept: "Rolling reserve retenida (10%)",    type: "out" as const, amount: -920000,  fee:      0, balance: 85850000 },
  { date: "07 jun", concept: "Recaudo Link · BRB-9XQ4LM",        type: "in"  as const, amount:  1200000, fee:  14400, balance: 86770000 },
];

export const EstadoCuentaView: React.FC<Props> = ({ fmt, onToast }) => {
  const th: React.CSSProperties = {
    textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
    letterSpacing: ".5px", color: "var(--t3)", padding: "11px 16px",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "13px 16px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };

  const handleExportPDF = () => {
    exportStatementPDF(MOVIMIENTOS, "Junio 2026");
    onToast("ok", "PDF generado", "Descargando estado de cuenta…");
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* Encabezado con botón PDF */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px" }}>Estado de Cuenta</h1>
          <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>
            Movimientos, comisiones y reportes financieros
          </p>
        </div>

        {/* ← Botón que faltaba */}
        <div style={{ display: "flex", gap: "9px" }}>
          <button style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            Junio 2026 ▾
          </button>
          <button
            onClick={handleExportPDF}
            style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Resumen del mes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", marginBottom: "18px" }}>
        {[
          { label: "Saldo inicial · 1 jun",  value: fmt(61430000),        color: "var(--t1)" },
          { label: "Movimiento neto del mes", value: `+${fmt(22890000)}`, color: "var(--success)" },
          { label: "Saldo disponible actual", value: fmt(84320000),        color: "var(--t1)" },
        ].map((c) => (
          <div key={c.label} style={{ padding: "16px 18px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: "12px", color: "var(--t2)", marginBottom: "7px" }}>{c.label}</div>
            <div style={{ fontSize: "21px", fontWeight: 700, letterSpacing: "-.5px", color: c.color, fontVariantNumeric: "tabular-nums" }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tabla de movimientos */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "14.5px", fontWeight: 600 }}>Movimientos</h3>
          <span style={{ fontSize: "12px", color: "var(--t3)" }}>incluye comisiones y liberaciones de garantía</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Concepto</th>
                <th style={th}>Tipo</th>
                <th style={{ ...th, textAlign: "right" }}>Cargo / Abono</th>
                <th style={{ ...th, textAlign: "right" }}>Comisión</th>
                <th style={{ ...th, textAlign: "right" }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {MOVIMIENTOS.map((row, i) => (
                <tr
                  key={i}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  style={{ transition: ".1s" }}
                >
                  <td style={td}>{row.date}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{row.concept}</td>
                  <td style={td}><Badge variant={row.type} /></td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: row.type === "in" ? "var(--success)" : "var(--error)" }}>
                      {row.amount > 0 ? "+" : ""}{fmt(row.amount)}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right", color: "var(--t3)", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                    {row.fee ? fmt(row.fee) : "—"}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};