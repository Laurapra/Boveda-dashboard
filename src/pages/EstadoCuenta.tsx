// src/pages/EstadoCuenta.tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { syncMyPayouts } from "../lib/bepayClient";
import type { ToastType } from "../types";
import "./EstadoCuenta.css";

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
  payer_name: string | null;
  payer_document: string | null;
  bank_name: string | null;
  account_type: string | null;
  account_key: string | null;
  payment_method: string | null;
  ben_doc_type: string | null;
  ben_doc_number: string | null;
  tarifa_aplicada: string | null;
  comision_total: number | null;
  created_at: string;
}

export type { TxRow as EstadoTxRow };

function counterpartyName(t: TxRow): string | null {
  return t.type === "charge" ? t.payer_name : t.ben_name;
}

function counterpartyDoc(t: TxRow): string | null {
  if (t.type === "charge") {
    return t.payer_document?.trim() || null;
  }
  const parts = [t.ben_doc_type, t.ben_doc_number].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function formatLlave(t: TxRow): string {
  const key = (t.account_key ?? "").trim();
  if (!key) return "—";
  return key.startsWith("@") ? key : `@${key}`;
}

function formatCuenta(t: TxRow): string {
  if (t.account_type) return t.account_type;
  if (t.payment_method) return t.payment_method;
  return "—";
}

function conceptLabel(t: TxRow): string {
  if (t.type === "payout") {
    return t.account_type === "Bre-B" ? "Dispersión Bre-B" : "Dispersión ACH";
  }

  const raw = `${t.payment_method ?? ""} ${t.concept ?? ""}`.toUpperCase();
  const isQr = raw.includes("QR");
  const isStatic = raw.includes("STATIC") || raw.includes("ESTATIC") || raw.includes("ESTÁTIC");

  if (raw.includes("NEQUI")) return "Recaudo Nequi Push";
  if (isQr && isStatic) return "Recaudo QR Estático Bre-B";
  if (isQr) return "Recaudo QR dinámico Bre-B";
  if (raw.includes("BREB") || raw.includes("BRE-B") || raw.includes("MOVII")) return "Recaudo llave Bre-B";
  if (t.payment_method) {
    const method = t.payment_method.toLowerCase();
    return "Recaudo " + method.charAt(0).toUpperCase() + method.slice(1);
  }
  return "Recaudo";
}

function statusGroup(s: string): "completed" | "pending" | "rejected" {
  if (s === "APPROVED" || s === "COMPLETED") return "completed";
  if (s === "PENDING") return "pending";
  return "rejected";
}

function statusLabel(s: string) {
  if (s === "APPROVED" || s === "COMPLETED") return "Completado";
  if (s === "PENDING") return "Pendiente";
  return "Rechazado";
}

function statusPillClass(s: string) {
  if (s === "APPROVED" || s === "COMPLETED") return "estado-pill estado-pill--ok";
  if (s === "PENDING") return "estado-pill estado-pill--pending";
  return "estado-pill estado-pill--bad";
}

export const EstadoCuentaView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const [txns, setTxns] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending" | "rejected">("all");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try { await syncMyPayouts(); } catch { /* no bloquea la carga */ }

    const desde = `${mes}-01`;
    const hasta = new Date(new Date(desde).setMonth(new Date(desde).getMonth() + 1)).toISOString().slice(0, 10);

    let q = supabase
      .from("bepay_transactions")
      .select("id, bepay_ide, type, amount, concept, status, ben_name, payer_name, payer_document, bank_name, account_type, account_key, payment_method, ben_doc_type, ben_doc_number, tarifa_aplicada, comision_total, created_at")
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at", { ascending: false });
    if (!isAdmin) q = q.eq("user_id", user.id);

    const { data } = await q;
    setTxns((data ?? []) as TxRow[]);
    setLoading(false);
  }, [user, isAdmin, mes]);

  useEffect(() => { load(); }, [load]);

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

  const completadas = txns.filter((t) => t.status === "APPROVED" || t.status === "COMPLETED");
  const recibido = completadas.filter((t) => t.type === "charge").reduce((s, t) => s + t.amount, 0);
  const dispersado = completadas.filter((t) => t.type === "payout").reduce((s, t) => s + t.amount, 0);
  const comisiones = completadas.reduce((s, t) => s + (t.comision_total ?? 0), 0);
  const neto = recibido - dispersado - comisiones;
  const filteredTxns = txns.filter((t) => statusFilter === "all" || statusGroup(t.status) === statusFilter);

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const mesLabel = new Date(`${mes}-15`).toLocaleDateString("es-CO", { month: "long", year: "numeric" });

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

      doc.setTextColor(26, 26, 24);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Resumen del período", 14, 38);

      const resumen = [
        ["Total recibido", fmt(recibido), "Cobros completados"],
        ["Total dispersado", fmt(dispersado), "Dispersiones completadas"],
        ["Comisiones", fmt(comisiones), "Cargos por operación"],
        ["Movimiento neto", fmt(neto), "Recibido − Dispersado − Comisiones"],
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

      autoTable(doc, {
        startY: 70,
        head: [["Fecha", "IDE", "Tipo", "Concepto", "De / Para", "Documento", "Llave", "Cuenta", "Banco", "Monto", "Comisión", "Estado"]],
        body: filteredTxns.map((t) => [
          new Date(t.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }),
          t.bepay_ide ?? "—",
          t.type === "charge" ? "Cobro" : "Dispersión",
          conceptLabel(t),
          counterpartyName(t) ?? "—",
          counterpartyDoc(t) ?? "—",
          formatLlave(t),
          formatCuenta(t),
          t.bank_name ?? "—",
          (t.type === "charge" ? "+" : "-") + fmt(t.amount),
          t.comision_total ? fmt(t.comision_total) : "—",
          statusLabel(t.status),
        ]),
        styles: { fontSize: 6.5, cellPadding: 2 },
        headStyles: { fillColor: [26, 26, 24], textColor: [255, 255, 255], fontSize: 6.5, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 249, 247] },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 18 },
          2: { cellWidth: 18 },
          3: { cellWidth: 32 },
          4: { cellWidth: 28 },
          5: { cellWidth: 22 },
          6: { cellWidth: 28 },
          7: { cellWidth: 18 },
          8: { cellWidth: 22 },
          9: { cellWidth: 22, halign: "right" },
          10: { cellWidth: 20,halign: "right" },
          11: { cellWidth: 18 },
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 9) {
            const val = String(data.cell.text[0]);
            data.cell.styles.textColor = val.startsWith("+") ? [15, 110, 86] : [163, 45, 45];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

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

  return (
    <div className="estado">
      <div className="estado-toolbar">
        <div className="estado-toolbar__field">
          <label htmlFor="estado-mes">Mes</label>
          <input
            id="estado-mes"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            aria-label="Mes"
          />
        </div>
        <div className="estado-toolbar__field">
          <label htmlFor="estado-status-filter">Estado</label>
          <select
            id="estado-status-filter"
            name="estado-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Estado"
          >
            <option value="all">Todos los estados</option>
            <option value="completed">Completado</option>
            <option value="pending">Pendiente</option>
            <option value="rejected">Rechazado</option>
          </select>
        </div>
        <div className="estado-toolbar__actions">
          <button type="button" className="estado-btn estado-btn--icon" onClick={load} aria-label="Actualizar">
            <i className="ti ti-refresh" />
          </button>
          <button type="button" className="estado-btn estado-btn--primary" onClick={handleExportPDF}>
            <i className="ti ti-file-download" />
            <span className="hide-sm">PDF</span>
          </button>
        </div>
      </div>

      <div className="estado-summary">
        <div className="estado-metric">
          <div className="estado-metric__label">Total recibido</div>
          <div className="estado-metric__value estado-metric__value--in">{loading ? "—" : fmt(recibido)}</div>
        </div>
        <div className="estado-metric">
          <div className="estado-metric__label">Total dispersado</div>
          <div className="estado-metric__value estado-metric__value--out">{loading ? "—" : fmt(dispersado)}</div>
        </div>
        <div className="estado-metric">
          <div className="estado-metric__label">Comisiones</div>
          <div className="estado-metric__value estado-metric__value--fee">{loading ? "—" : fmt(comisiones)}</div>
        </div>
        <div className="estado-metric">
          <div className="estado-metric__label">Movimiento neto</div>
          <div
            className="estado-metric__value"
            style={{ color: neto >= 0 ? "var(--success)" : "var(--error)" }}
          >
            {loading ? "—" : fmt(neto)}
          </div>
        </div>
      </div>

      <div className="estado-panel">
        <div className="estado-panel__head">
          <h3 className="estado-panel__title">Movimientos</h3>
          <span className="estado-panel__count">{filteredTxns.length} registros</span>
        </div>

        {loading ? (
          <div className="estado-loading">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
          </div>
        ) : filteredTxns.length === 0 ? (
          <div className="estado-empty">Sin movimientos en este período</div>
        ) : (
          <>
            <div className="estado-cards">
              {filteredTxns.map((row) => {
                const isCharge = row.type === "charge";
                const doc = counterpartyDoc(row);
                return (
                  <article key={row.id} className="estado-card">
                    <div className="estado-card__top">
                      <div>
                        <div className="estado-card__concept">{conceptLabel(row)}</div>
                        <div className="estado-card__party">{counterpartyName(row) ?? "—"}</div>
                      </div>
                      <div
                        className="estado-card__amount"
                        style={{ color: isCharge ? "var(--success)" : "var(--error)" }}
                      >
                        {isCharge ? "+" : "-"}{fmt(row.amount)}
                      </div>
                    </div>
                    <div className="estado-card__meta">
                      <span className={isCharge ? "estado-pill estado-pill--in" : "estado-pill estado-pill--out"}>
                        <i className={`ti ${isCharge ? "ti-arrow-down-right" : "ti-arrow-up-right"}`} />
                        {isCharge ? "Cobro" : "Dispersión"}
                      </span>
                      <span className={statusPillClass(row.status)}>{statusLabel(row.status)}</span>
                      <span>
                        {new Date(row.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                        {" · "}
                        {new Date(row.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <dl className="estado-card__grid">
                      <div>
                        <dt>Llave</dt>
                        <dd className="estado-mono">{formatLlave(row)}</dd>
                      </div>
                      <div>
                        <dt>Cuenta</dt>
                        <dd>{formatCuenta(row)}</dd>
                      </div>
                      <div>
                        <dt>Documento</dt>
                        <dd>{doc ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Banco</dt>
                        <dd>{row.bank_name ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>IDE</dt>
                        <dd className="estado-mono">{row.bepay_ide ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Comisión</dt>
                        <dd>{row.comision_total ? fmt(row.comision_total) : "—"}</dd>
                      </div>
                      {row.tarifa_aplicada ? (
                        <div>
                          <dt>Tarifa</dt>
                          <dd>{row.tarifa_aplicada}</dd>
                        </div>
                      ) : null}
                      {row.payment_method ? (
                        <div>
                          <dt>Método</dt>
                          <dd>{row.payment_method}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                );
              })}
            </div>

            <div className="estado-tableWrap">
              <table className="estado-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>IDE</th>
                    <th>Tipo</th>
                    <th>Concepto</th>
                    <th>De / Para</th>
                    <th>Documento</th>
                    <th>Llave</th>
                    <th>Cuenta</th>
                    <th>Banco</th>
                    <th>Método</th>
                    <th className="num">Monto</th>
                    <th className="num">Comisión</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.map((row) => {
                    const isCharge = row.type === "charge";
                    return (
                      <tr key={row.id}>
                        <td>
                          <div style={{ color: "var(--t1)" }}>
                            {new Date(row.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--t3)" }}>
                            {new Date(row.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="estado-mono">{row.bepay_ide ?? "—"}</td>
                        <td>
                          <span className={isCharge ? "estado-pill estado-pill--in" : "estado-pill estado-pill--out"}>
                            <i className={`ti ${isCharge ? "ti-arrow-down-right" : "ti-arrow-up-right"}`} />
                            {isCharge ? "Cobro" : "Dispersión"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500, color: "var(--t1)" }}>{conceptLabel(row)}</td>
                        <td style={{ color: "var(--t1)" }}>{counterpartyName(row) ?? "—"}</td>
                        <td style={{ color: "var(--t2)", fontSize: 12 }}>{counterpartyDoc(row) ?? "—"}</td>
                        <td className="estado-mono">{formatLlave(row)}</td>
                        <td style={{ color: "var(--t2)", fontSize: 12 }}>{formatCuenta(row)}</td>
                        <td style={{ color: "var(--t2)", fontSize: 12 }}>{row.bank_name ?? "—"}</td>
                        <td style={{ color: "var(--t2)", fontSize: 12 }}>{row.payment_method ?? "—"}</td>
                        <td className="num" style={{ fontWeight: 700, color: isCharge ? "var(--success)" : "var(--error)" }}>
                          {isCharge ? "+" : "-"}{fmt(row.amount)}
                        </td>
                        <td className="num" style={{ color: "var(--t3)", fontSize: 12 }}>
                          {row.comision_total ? fmt(row.comision_total) : "—"}
                        </td>
                        <td>
                          <span className={statusPillClass(row.status)}>{statusLabel(row.status)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
