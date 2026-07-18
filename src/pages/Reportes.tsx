// src/pages/Reportes.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useBeneficiaries } from "../hooks/useBeneficiaries";
import { EMPRESA, type ReportType } from "../types";

interface Props {
  fmt: (n: number) => string;
}

interface TxRow {
  id: string;
  bepay_ide: string | null;
  type: "charge" | "payout";
  amount: number;
  concept: string;
  status: string;
  ben_name: string | null;
  ben_doc_type: string | null;
  ben_doc_number: string | null;
  comision_total: number | null;
  created_at: string;
}

interface AutoTableCellHookData {
  section: "head" | "body" | "foot";
  column: { index: number };
  cell: {
    text: string[];
    styles: {
      textColor?: number[];
      fontStyle?: string;
      [key: string]: unknown;
    };
  };
}

const REPORT_TYPES: { key: ReportType; name: string; desc: string; icon: string; color: string }[] = [
  { key: "extracto", name: "Extracto de cuenta", desc: "Todas las transacciones del período", icon: "ti-file-text", color: "var(--error)" },
  { key: "dispersiones", name: "Dispersiones", desc: "Envíos realizados en el período", icon: "ti-send", color: "var(--accent)" },
  { key: "recepciones", name: "Recepciones", desc: "Pagos recibidos en el período", icon: "ti-download", color: "var(--success)" },
  { key: "beneficiarios", name: "Beneficiarios", desc: "Listado completo con cuentas", icon: "ti-users", color: "var(--warning)" },
];

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "Completado",
  COMPLETED: "Completado",
  PENDING: "Pendiente",
  DECLINED: "Rechazado",
  FAILED: "Rechazado",
};

// Única llamada impura (new Date()) aislada del cuerpo del componente,
// siguiendo la regla react-hooks/purity.
function todayFormatted(): string {
  return new Date().toLocaleDateString("es-CO");
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

export const ReportesView: React.FC<Props> = ({ fmt }) => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const { beneficiaries, loading: bensLoading } = useBeneficiaries();

  const [txns, setTxns] = useState<TxRow[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(true);
  const [selected, setSelected] = useState<ReportType>("extracto");
  const [desde, setDesde] = useState("2026-06-01");
  const [hasta, setHasta] = useState("2026-07-31");
  const [status, setStatus] = useState("");

  // ── Cargar transacciones reales ─────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    setLoadingTxns(true);
    let q = supabase
      .from("bepay_transactions")
      .select("id, bepay_ide, type, amount, concept, status, ben_name, ben_doc_type, ben_doc_number, comision_total, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!isAdmin) q = q.eq("user_id", user.id);
    const { data } = await q;
    setTxns((data ?? []) as TxRow[]);
    setLoadingTxns(false);
  }, [user, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — el reporte se mantiene actualizado sin recargar manualmente
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("reportes-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bepay_transactions",
          ...(isAdmin ? {} : { filter: "user_id=eq." + user.id }),
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, isAdmin, load]);

  // ── Filtrar según selección ──────────────────────────────────
  const filteredTxns = useMemo(() => {
    const d = new Date(desde);
    const h = new Date(hasta + "T23:59:59");
    return txns.filter((t) => {
      const fecha = new Date(t.created_at);
      const inRange = fecha >= d && fecha <= h;
      const matchStatus = !status || (STATUS_LABELS[t.status] ?? t.status) === status;
      if (selected === "dispersiones") return inRange && matchStatus && t.type === "payout";
      if (selected === "recepciones") return inRange && matchStatus && t.type === "charge";
      return inRange && matchStatus;
    });
  }, [txns, desde, hasta, status, selected]);

  const counts = useMemo(
    () => ({
      extracto: txns.length,
      dispersiones: txns.filter((t) => t.type === "payout").length,
      recepciones: txns.filter((t) => t.type === "charge").length,
      beneficiarios: beneficiaries.length,
    }),
    [txns, beneficiaries]
  );

  const completadas = filteredTxns.filter((t) => t.status === "APPROVED" || t.status === "COMPLETED");
  const montoTotal = completadas.reduce((s, t) => s + t.amount, 0);
  const comisionTotal = completadas.reduce((s, t) => s + (t.comision_total ?? 0), 0);

  // ── Exportar PDF real ────────────────────────────────────────
  const handleDownloadPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const tipoLabel = REPORT_TYPES.find((r) => r.key === selected)?.name ?? selected;
      const isBen = selected === "beneficiarios";
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // ── Encabezado ──
      doc.setFillColor(26, 26, 24);
      doc.rect(0, 0, 297, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(EMPRESA.nombre + " · " + EMPRESA.portal, 14, 10);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(tipoLabel, 14, 19);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Período: " + desde + " al " + hasta + (status ? " · Estado: " + status : ""), 180, 10);
      doc.text("Generado: " + todayFormatted(), 180, 16);

      // ── Info boxes (solo txns) ──
      if (!isBen) {
        const boxes: [string, string][] = [
          ["Registros", String(filteredTxns.length)],
          ["Completados", String(completadas.length)],
          ["Monto total", fmt(montoTotal)],
          ["Comisiones", fmt(comisionTotal)],
        ];
        let xB = 14;
        boxes.forEach(([label, value]) => {
          doc.setFillColor(245, 244, 240);
          doc.roundedRect(xB, 34, 62, 18, 2, 2, "F");
          doc.setFontSize(7);
          doc.setTextColor(138, 137, 129);
          doc.text(label, xB + 4, 41);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(26, 26, 24);
          doc.text(value, xB + 4, 48);
          doc.setFont("helvetica", "normal");
          xB += 66;
        });
      }

      // ── Tabla transacciones ──
      if (!isBen) {
        autoTable(doc, {
          startY: 58,
          head: [["ID", "Fecha", "Tipo", "Concepto / Beneficiario", "Monto", "Comisión", "Estado"]],
          body: filteredTxns.map((t) => [
            t.bepay_ide ?? t.id.slice(0, 12),
            new Date(t.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }),
            t.type === "charge" ? "Cobro" : "Dispersión",
            t.ben_name ?? t.concept ?? "—",
            (t.type === "charge" ? "+" : "-") + fmt(t.amount),
            t.comision_total ? fmt(t.comision_total) : "—",
            STATUS_LABELS[t.status] ?? t.status,
          ]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [26, 26, 24], textColor: [255, 255, 255], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [250, 249, 247] },
          columnStyles: {
            0: { cellWidth: 34, font: "courier", fontSize: 7 },
            1: { cellWidth: 28 },
            2: { cellWidth: 22 },
            3: { cellWidth: 72 },
            4: { cellWidth: 30, halign: "right" },
            5: { cellWidth: 26, halign: "right" },
            6: { cellWidth: 24 },
          },
          didParseCell: (data: AutoTableCellHookData) => {
            if (data.section === "body") {
              if (data.column.index === 4) {
                const v = String(data.cell.text[0]);
                data.cell.styles.textColor = v.startsWith("+") ? [15, 110, 86] : [163, 45, 45];
                data.cell.styles.fontStyle = "bold";
              }
              if (data.column.index === 6) {
                const v = String(data.cell.text[0]);
                data.cell.styles.textColor = v === "Completado" ? [15, 110, 86] : v === "Pendiente" ? [133, 79, 11] : [163, 45, 45];
              }
            }
          },
        });
      }

      // ── Tabla beneficiarios (datos reales de Supabase) ──
      if (isBen) {
        autoTable(doc, {
          startY: 36,
          head: [["Nombre", "Tipo Doc.", "Número Doc.", "Cuentas", "Celular", "Correo"]],
          body: beneficiaries.map((b) => [
            b.full_name,
            b.doc_type,
            b.doc_number,
            b.accounts.length + " cuenta(s)",
            b.phone || "—",
            b.email || "—",
          ]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [26, 26, 24], textColor: [255, 255, 255], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [250, 249, 247] },
        });
      }

      // ── Pie ──
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(138, 137, 129);
        doc.text(EMPRESA.nombre + " · NIT " + EMPRESA.nit + " · " + EMPRESA.portal + " · Página " + i + " de " + pages, 14, 205);
      }

      doc.save("Reporte-" + tipoLabel.replace(/ /g, "-") + "-" + desde + "-" + hasta + ".pdf");
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
    }
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "13px", outline: "none" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "5px" };

  const isLoading = selected === "beneficiarios" ? bensLoading : loadingTxns;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "16px", alignItems: "start" }}>
        {/* Tipos */}
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "12px" }}>
            Selecciona el tipo de reporte
          </div>
          {REPORT_TYPES.map((r) => (
            <div
              key={r.key}
              onClick={() => setSelected(r.key)}
              style={{
                background: "var(--surface)",
                border: "1px solid " + (selected === r.key ? "var(--accent)" : "var(--border)"),
                borderRadius: "var(--radius-sm)",
                padding: "14px 16px",
                cursor: "pointer",
                marginBottom: "10px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                transition: ".12s",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0,
                  background: selected === r.key ? "var(--accent-dim)" : "var(--elevated)",
                  color: selected === r.key ? "var(--accent)" : r.color,
                }}
              >
                <i className={"ti " + r.icon} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--t1)", marginBottom: "2px" }}>{r.name}</div>
                <div style={{ fontSize: "11px", color: "var(--t3)" }}>{r.desc}</div>
              </div>
              <span style={{ fontSize: "11px", fontWeight: 600, background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", padding: "2px 10px", color: "var(--t2)" }}>
                {r.key === "beneficiarios" ? (bensLoading ? "…" : counts.beneficiarios) : loadingTxns ? "…" : counts[r.key]}
              </span>
            </div>
          ))}
        </div>

        {/* Panel filtros */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "18px", boxShadow: "var(--shadow)", position: "sticky", top: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "16px", display: "flex", alignItems: "center", gap: "7px", color: "var(--t1)" }}>
            <i className="ti ti-filter" style={{ color: "var(--accent)" }} />
            Filtros
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={inputStyle} />
          </div>
          {selected !== "beneficiarios" ? (
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Estado</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                <option value="">Todos</option>
                <option value="Completado">Completado</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Rechazado">Rechazado</option>
              </select>
            </div>
          ) : null}

          {/* Preview */}
          <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px 14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "8px" }}>
              Vista previa
            </div>
            {selected === "beneficiarios" ? (
              bensLoading ? (
                <div style={{ fontSize: "12px", color: "var(--t3)" }}>Cargando...</div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "4px 0" }}>
                  <span style={{ color: "var(--t3)" }}>Beneficiarios</span>
                  <span style={{ fontWeight: 500, color: "var(--t1)" }}>{beneficiaries.length}</span>
                </div>
              )
            ) : loadingTxns ? (
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>Cargando...</div>
            ) : (
              [
                ["Registros", String(filteredTxns.length)],
                ["Completados", String(completadas.length)],
                ["Monto total", fmt(montoTotal)],
                ["Comisiones", fmt(comisionTotal)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t3)" }}>{k}</span>
                  <span style={{ fontWeight: 500, color: "var(--t1)" }}>{v}</span>
                </div>
              ))
            )}
          </div>

          <button
            onClick={handleDownloadPDF}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "10px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600,
              fontSize: "13px",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
            }}
          >
            <i className="ti ti-file-download" />
            Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
};