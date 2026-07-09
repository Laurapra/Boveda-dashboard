// src/pages/EstadoCuenta.tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import type { ToastType } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

interface TxRow {
  id: string;
  bepay_ide: string | null;
  type: "charge" | "payout";
  amount: number;
  concept: string;
  status: string;
  ben_name: string | null;
  comision_total: number | null;
  created_at: string;
}

// Exportar datos para Reportes
export type { TxRow as EstadoTxRow };

export const EstadoCuentaView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user }  = useAuthStore();
  const isAdmin   = user?.role === "admin";

  const [txns, setTxns]     = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes]         = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const desde = `${mes}-01`;
    const hasta = new Date(new Date(desde).setMonth(new Date(desde).getMonth() + 1)).toISOString().slice(0, 10);

    let q = supabase
      .from("bepay_transactions")
      .select("id, bepay_ide, type, amount, concept, status, ben_name, comision_total, created_at")
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at", { ascending: false });
    if (!isAdmin) q = q.eq("user_id", user.id);

    const { data } = await q;
    setTxns((data ?? []) as TxRow[]);
    setLoading(false);
  }, [user, isAdmin, mes]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("estado-rt")
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "bepay_transactions",
        ...(isAdmin ? {} : { filter: `user_id=eq.${user.id}` }),
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, isAdmin, load]);

  // ── Métricas del mes ─────────────────────────────────────────
  const completadas = txns.filter(t => t.status === "APPROVED" || t.status === "COMPLETED");
  const recibido    = completadas.filter(t => t.type === "charge").reduce((s, t) => s + t.amount, 0);
  const dispersado  = completadas.filter(t => t.type === "payout").reduce((s, t) => s + t.amount, 0);
  const comisiones  = completadas.reduce((s, t) => s + (t.comision_total ?? 0), 0);
  const neto        = recibido - dispersado - comisiones;

  // ── Exportar PDF ─────────────────────────────────────────────
  const handleExportPDF = async () => {
    try {
      const { default: jsPDF }     = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc  = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const mesLabel = new Date(`${mes}-15`).toLocaleDateString("es-CO", { month: "long", year: "numeric" });

      // ── Encabezado ──
      doc.setFillColor(26, 26, 24);
      doc.rect(0, 0, 297, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text("GLOBAL COIN SAS · RAMPLIX", 14, 10);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Estado de Cuenta", 14, 19);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Período: ${mesLabel}`, 200, 10);
      doc.text(`Generado: ${new Date().toLocaleDateString("es-CO")}`, 200, 16);

      // ── Resumen del mes ──
      doc.setTextColor(26, 26, 24);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Resumen del período", 14, 38);

      const resumen = [
        ["Total recibido",   fmt(recibido),   "Cobros completados"],
        ["Total dispersado", fmt(dispersado),  "Dispersiones completadas"],
        ["Comisiones",       fmt(comisiones),  "Cargos por operación"],
        ["Movimiento neto",  fmt(neto),        "Recibido − Dispersado − Comisiones"],
      ];

      let xR = 14;
      resumen.forEach(([label, value, sub]) => {
        doc.setFillColor(245, 244, 240);
        doc.roundedRect(xR, 42, 64, 22, 2, 2, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(138, 137, 129);
        doc.text(label, xR + 4, 49);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(26, 26, 24);
        doc.text(value, xR + 4, 56);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(138, 137, 129);
        doc.text(sub, xR + 4, 61);
        xR += 68;
      });

      // ── Tabla ──
      autoTable(doc, {
        startY: 70,
        head: [["Fecha", "Tipo", "Concepto / Beneficiario", "Monto", "Comisión", "Estado"]],
        body: txns.map(t => [
          new Date(t.created_at).toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" }),
          t.type === "charge" ? "Cobro" : "Dispersión",
          t.ben_name ?? t.concept ?? "—",
          (t.type === "charge" ? "+" : "-") + fmt(t.amount),
          t.comision_total ? fmt(t.comision_total) : "—",
          t.status === "APPROVED" || t.status === "COMPLETED" ? "Completado"
            : t.status === "PENDING" ? "Pendiente" : "Rechazado",
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [26, 26, 24], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 249, 247] },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 24 },
          2: { cellWidth: 80 },
          3: { cellWidth: 30, halign: "right" },
          4: { cellWidth: 26, halign: "right" },
          5: { cellWidth: 24 },
        },
        didDrawCell: (data: any) => {
          if (data.section === "body" && data.column.index === 5) {
            const val = String(data.cell.text[0]);
            if (val === "Completado") doc.setTextColor(15, 110, 86);
            else if (val === "Pendiente") doc.setTextColor(133, 79, 11);
            else doc.setTextColor(163, 45, 45);
          }
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 3) {
            const val = String(data.cell.text[0]);
            data.cell.styles.textColor = val.startsWith("+") ? [15, 110, 86] : [163, 45, 45];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      // ── Pie ──
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(138, 137, 129);
        doc.text(`Global Coin SAS · Operado por Ramplix · Página ${i} de ${pageCount}`, 14, 205);
        doc.text("Este documento es de uso interno y constituye soporte oficial de las operaciones.", 14, 209);
      }

      doc.save(`EstadoCuenta-${mes}.pdf`);
      onToast("ok", "PDF generado", `EstadoCuenta-${mes}.pdf`);
    } catch (err: any) {
      onToast("error", "Error al generar PDF", err.message);
    }
  };

  const th: React.CSSProperties = {
    textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
    letterSpacing: ".5px", color: "var(--t3)", padding: "11px 16px",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "12px 16px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };

  const statusLabel = (s: string) =>
    s === "APPROVED" || s === "COMPLETED" ? "Completado"
    : s === "PENDING" ? "Pendiente" : "Rechazado";

  const statusColor = (s: string) =>
    s === "APPROVED" || s === "COMPLETED" ? "var(--success)"
    : s === "PENDING" ? "var(--warning)" : "var(--error)";

  const statusBg = (s: string) =>
    s === "APPROVED" || s === "COMPLETED" ? "var(--success-dim)"
    : s === "PENDING" ? "var(--warning-dim)" : "var(--error-dim)";

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", color: "var(--t1)" }}>Estado de Cuenta</h1>
          <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>
            Movimientos y comisiones · {isAdmin ? "todos los usuarios" : "tu cuenta"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "9px" }}>
          <input
            type="month" value={mes}
            onChange={(e) => setMes(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontSize: "13px", outline: "none" }}
          />
          <button onClick={load} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer" }}>
            <i className="ti ti-refresh" />
          </button>
          <button onClick={handleExportPDF} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            <i className="ti ti-file-download" />PDF
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "18px" }}>
        {[
          { label: "Total recibido",   value: fmt(recibido),   color: "var(--success)" },
          { label: "Total dispersado", value: fmt(dispersado),  color: "var(--error)" },
          { label: "Comisiones",       value: fmt(comisiones),  color: "var(--warning)" },
          { label: "Movimiento neto",  value: fmt(neto),        color: neto >= 0 ? "var(--success)" : "var(--error)" },
        ].map((c) => (
          <div key={c.label} style={{ padding: "16px 18px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: "12px", color: "var(--t2)", marginBottom: "7px" }}>{c.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-.5px", color: c.color, fontVariantNumeric: "tabular-nums" }}>
              {loading ? "—" : c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--t1)" }}>Movimientos</h3>
          <span style={{ fontSize: "12px", color: "var(--t3)" }}>{txns.length} registros</span>
        </div>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
          </div>
        ) : txns.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)" }}>Sin movimientos en este período</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Concepto / Beneficiario</th>
                  <th style={{ ...th, textAlign: "right" }}>Monto</th>
                  <th style={{ ...th, textAlign: "right" }}>Comisión</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((row) => (
                  <tr key={row.id}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    style={{ transition: ".1s" }}
                  >
                    <td style={td}>
                      <div style={{ color: "var(--t1)" }}>
                        {new Date(row.created_at).toLocaleDateString("es-CO", { day:"2-digit", month:"short" })}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--t3)" }}>
                        {new Date(row.created_at).toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" })}
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 8px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, background: row.type === "charge" ? "var(--success-dim)" : "var(--error-dim)", color: row.type === "charge" ? "var(--success)" : "var(--error)" }}>
                        <i className={`ti ${row.type === "charge" ? "ti-arrow-down-right" : "ti-arrow-up-right"}`} style={{ fontSize: "12px" }} />
                        {row.type === "charge" ? "Cobro" : "Dispersión"}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 500, color: "var(--t1)", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.ben_name ?? row.concept ?? "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: row.type === "charge" ? "var(--success)" : "var(--error)" }}>
                      {row.type === "charge" ? "+" : "-"}{fmt(row.amount)}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: "var(--t3)", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                      {row.comision_total ? fmt(row.comision_total) : "—"}
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 500, color: statusColor(row.status), background: statusBg(row.status) }}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};