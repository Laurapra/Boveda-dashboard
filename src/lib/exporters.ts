// src/lib/exporters.ts
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Transaction, StatementRow } from "../types";

const COP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

// ── Exportar transacciones a XLSX ────────────────────────────────
export function exportTransactionsXLSX(transactions: Transaction[]) {
  const rows = transactions.map((tx) => ({
    "ID":          tx.id,
    "Fecha":       new Date(tx.created_at).toLocaleDateString("es-CO"),
    "Método":      tx.method,
    "Pagador":     tx.payer_name,
    "Documento":   tx.payer_doc,
    "Referencia":  tx.reference,
    "Monto":       tx.amount,
    "Comisión":    tx.fee,
    "Estado":      tx.status,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Ancho de columnas
  ws["!cols"] = [
    { wch: 14 }, { wch: 12 }, { wch: 8 },
    { wch: 26 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 12 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transacciones");
  XLSX.writeFile(wb, `boveda_recaudo_${Date.now()}.xlsx`);
}

// ── Exportar estado de cuenta a PDF ─────────────────────────────
export function exportStatementPDF(rows: StatementRow[], period: string) {
  const doc = new jsPDF();

  // Encabezado
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Bóveda · Estado de Cuenta", 14, 20);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`Período: ${period}`, 14, 28);
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CO")}`, 14, 34);

  doc.setTextColor(0);

  // Tabla de movimientos
  autoTable(doc, {
    startY: 44,
    head: [["Fecha", "Concepto", "Tipo", "Cargo / Abono", "Comisión", "Saldo"]],
    body: rows.map((r) => [
      r.date,
      r.concept,
      r.type === "in" ? "Abono" : "Cargo",
      `${r.amount > 0 ? "+" : ""}${COP(r.amount)}`,
      r.fee ? COP(r.fee) : "—",
      COP(r.balance),
    ]),
    headStyles: { fillColor: [91, 127, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 246, 250] },
    styles: { fontSize: 9 },
  });

  doc.save(`boveda_estado_cuenta_${Date.now()}.pdf`);
}