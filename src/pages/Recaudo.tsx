import React, { useState } from "react";
import { useTransactions } from "../hooks/useTransactions";
import { Badge } from "../components/ui/Badge";
import type { PaymentMethod, TxStatus, ToastType } from "../types";
import { exportTransactionsXLSX } from "../lib/exporters";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// Chip visual que muestra el método de pago con color
function MethodChip({ method }: { method: PaymentMethod }) {
  const cfg: Record<PaymentMethod, { bg: string; color: string; letter: string }> = {
    "Bre-B": { bg: "#0E3A53", color: "#7DD3FC", letter: "B" },
    "Nequi": { bg: "#5B2A86", color: "#E9D5FF", letter: "N" },
    "Link": { bg: "#1F2937", color: "#C7D2FE", letter: "L" },
  };
  const c = cfg[method];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 8px", borderRadius: "7px", fontSize: "11.5px", fontWeight: 600, background: "var(--elevated)", border: "1px solid var(--border)" }}>
      <span style={{ width: "15px", height: "15px", borderRadius: "4px", display: "grid", placeItems: "center", fontSize: "9px", fontWeight: 800, background: c.bg, color: c.color }}>
        {c.letter}
      </span>
      {method}
    </span>
  );
}

export const RecaudoView: React.FC<Props> = ({ fmt, onToast }) => {
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [status, setStatus] = useState<TxStatus | "">("");
  const [query, setQuery] = useState("");

  // El hook aplica los filtros y devuelve las transacciones
  const { transactions, total, loading } = useTransactions({ method, status, query });

  const filterStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "7px",
    padding: "8px 11px", border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)", background: "var(--surface)",
    fontSize: "12.5px", color: "var(--t2)",
  };
  const selectStyle: React.CSSProperties = {
    background: "none", border: "none", color: "var(--t1)",
    fontSize: "12.5px", fontWeight: 500, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px" }}>Recaudo</h1>
          <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>
            Transacciones de entrada · Nequi, Bre-B y Links de pago
          </p>
        </div>
        <button
          onClick={() => onToast("info", "Próximamente", "Modal de creación de links")}
          style={{ padding: "10px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
        >
          + Crear Link de Pago
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", marginBottom: "14px" }}>
        <label style={filterStyle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
          <input
            placeholder="ID o referencia…" value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...selectStyle, width: "140px" }}
          />
        </label>
        <label style={filterStyle}>
          Método&nbsp;
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | "")} style={selectStyle}>
            <option value="">Todos</option>
            <option>Bre-B</option><option>Nequi</option><option>Link</option>
          </select>
        </label>
        <label style={filterStyle}>
          Estado&nbsp;
          <select value={status} onChange={(e) => setStatus(e.target.value as TxStatus | "")} style={selectStyle}>
            <option value="">Todos</option>
            <option value="paid">Pagado</option>
            <option value="frozen">Congelado</option>
            <option value="pending">Pendiente</option>
            <option value="failed">Fallido</option>
            <option value="held">Retenido</option>
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => {
            exportTransactionsXLSX(transactions);
            onToast("ok", "Exportando", "Descargando archivo XLSX…");
          }}
          style={filterStyle}
        >
          Exportar XLSX
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                {["ID", "Fecha", "Método", "Pagador", "Referencia", "Monto", "Comisión", "Estado", ""].map((h) => (
                  <th key={h} style={{ textAlign: h === "Monto" || h === "Comisión" ? "right" : "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--t3)", padding: "11px 16px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Cargando…</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Sin resultados. Ajusta los filtros.</td></tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    style={{ borderBottom: "1px solid var(--border)", transition: ".1s" }}
                  >
                    <td style={{ padding: "13px 16px", fontFamily: "var(--mono)", fontSize: "12px", color: "var(--t2)" }}>{tx.id}</td>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                      {new Date(tx.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                    </td>
                    <td style={{ padding: "13px 16px" }}><MethodChip method={tx.method} /></td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{tx.payer_name}</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--t3)" }}>{tx.payer_doc}</div>
                    </td>
                    <td style={{ padding: "13px 16px", fontFamily: "var(--mono)", fontSize: "12px", color: "var(--t2)" }}>{tx.reference}</td>
                    <td style={{ padding: "13px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(tx.amount)}</td>
                    <td style={{ padding: "13px 16px", textAlign: "right", color: "var(--t3)", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{fmt(tx.fee)}</td>
                    <td style={{ padding: "13px 16px" }}><Badge variant={tx.status} /></td>
                    <td style={{ padding: "13px 16px" }}>
                      <button
                        onClick={() => onToast("info", "Comprobante", `PDF para ${tx.reference}`)}
                        style={{ width: "28px", height: "28px", borderRadius: "7px", display: "grid", placeItems: "center", color: "var(--t3)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}
                        title="Ver comprobante"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <path d="M14 2v6h6M9 15h6" strokeLinecap="round" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", fontSize: "12.5px", color: "var(--t2)" }}>
          <span>Mostrando {transactions.length} de {total.toLocaleString("es-CO")} transacciones</span>
          <div style={{ display: "flex", gap: "5px" }}>
            {["‹", "1", "2", "3", "›"].map((p, i) => (
              <button key={i} style={{ width: "30px", height: "30px", borderRadius: "7px", border: "1px solid var(--border)", background: p === "1" ? "var(--accent)" : "var(--surface)", color: p === "1" ? "#fff" : "var(--t2)", fontWeight: 600, cursor: "pointer", display: "grid", placeItems: "center" }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};