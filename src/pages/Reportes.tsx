// src/pages/Reportes.tsx
import React, { useState, useMemo } from "react";
import { useDataStore } from "../store/dataStore";
import { ESTADOS, EMPRESA, type ReportType } from "../types";

interface Props {
  fmt: (n: number) => string;
}

const REPORT_TYPES: { key: ReportType; name: string; desc: string; icon: string; color: string }[] = [
  { key:"extracto",     name:"Extracto de cuenta",  desc:"Todas las transacciones del período",  icon:"ti-file-text",     color:"var(--error)" },
  { key:"dispersiones", name:"Dispersiones",         desc:"Envíos realizados en el período",      icon:"ti-send",          color:"var(--accent)" },
  { key:"recepciones",  name:"Recepciones",          desc:"Pagos recibidos en el período",        icon:"ti-download",      color:"var(--success)" },
  { key:"beneficiarios",name:"Beneficiarios",        desc:"Listado completo con cuentas",         icon:"ti-users",         color:"var(--warning)" },
];

export const ReportesView: React.FC<Props> = ({ fmt }) => {
  const { txns, bens } = useDataStore();
  const [selected, setSelected] = useState<ReportType>("extracto");
  const [desde, setDesde]       = useState("2026-06-01");
  const [hasta, setHasta]       = useState("2026-07-01");
  const [status, setStatus]     = useState("");

  const fmtCOP = (n: number) => "$" + Number(n).toLocaleString("es-CO");
  const fmtFecha = (d: Date) => d.toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" }) + " · " + d.toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit", hour12:true });

  const filteredTxns = useMemo(() => {
    const d = new Date(desde), h = new Date(hasta + "T23:59:59");
    return txns.filter((t) => {
      const inRange = t.fecha >= d && t.fecha <= h;
      const matchStatus = !status || t.estado === status;
      if (selected === "dispersiones") return inRange && matchStatus && t.tipo === "Enviado";
      if (selected === "recepciones")  return inRange && matchStatus && t.tipo === "Recibido";
      return inRange && matchStatus;
    });
  }, [txns, desde, hasta, status, selected]);

  const counts = useMemo(() => ({
    extracto:      txns.length,
    dispersiones:  txns.filter((t) => t.tipo === "Enviado").length,
    recepciones:   txns.filter((t) => t.tipo === "Recibido").length,
    beneficiarios: bens.length,
  }), [txns, bens]);


  const handleDownload = () => {
    const tipoLabel = REPORT_TYPES.find((r) => r.key === selected)?.name ?? selected;
    const isBen = selected === "beneficiarios";

    const rowsTxn = filteredTxns.map((t) => `
      <tr>
        <td style="font-family:monospace;font-size:10px">${t.id}</td>
        <td>${fmtFecha(t.fecha)}</td>
        <td>${t.tipo}</td>
        <td>${t.desc}</td>
        <td style="text-align:right;font-weight:500">${fmtCOP(t.monto)}</td>
        <td style="text-align:right">${fmtCOP(t.comision || 0)}</td>
        <td>${t.estado}</td>
      </tr>`).join("");

    const rowsBen = bens.map((b) => `
      <tr>
        <td style="font-weight:500">${b.nombre}</td>
        <td>${b.tipodoc}</td>
        <td style="font-family:monospace">${b.numdoc}</td>
        <td>${b.cuentas.length} cuenta(s)</td>
        <td>${b.indicativo} ${b.celular}</td>
        <td>${b.correo}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${tipoLabel}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f7f6f3;padding:32px;font-size:13px;color:#1a1a18}.doc{background:#fff;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:900px;margin:0 auto;overflow:hidden}.hdr{background:#1a1a18;color:#fff;padding:24px 32px}.hdr-brand{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin-bottom:6px}.hdr-title{font-size:22px;font-weight:700;margin-bottom:4px}.hdr-meta{font-size:12px;opacity:.7}.body{padding:24px 32px}.info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}.info-box{background:#f5f4f0;border-radius:7px;padding:12px 14px}.info-label{font-size:10px;color:#8a8981;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}.info-val{font-size:18px;font-weight:700}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 10px;background:#f5f4f0;color:#5f5e5a;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}td{padding:9px 10px;border-bottom:.5px solid #f0ede8}tr:last-child td{border:none}tr:hover td{background:#faf9f7}.footer{padding:16px 32px;text-align:center;font-size:10px;color:#8a8981;border-top:.5px solid #f0ede8}</style></head>
    <body><div class="doc">
      <div class="hdr"><div class="hdr-brand">${EMPRESA.nombre} · ${EMPRESA.portal}</div><div class="hdr-title">${tipoLabel}</div><div class="hdr-meta">Período: ${desde} al ${hasta}${status ? " · Estado: " + status : ""}</div></div>
      <div class="body">
        ${!isBen ? `<div class="info-grid">
          <div class="info-box"><div class="info-label">Registros</div><div class="info-val">${filteredTxns.length}</div></div>
          <div class="info-box"><div class="info-label">Completados</div><div class="info-val">${filteredTxns.filter((t) => t.estado === ESTADOS.COMPLETADO).length}</div></div>
          <div class="info-box"><div class="info-label">Monto total</div><div class="info-val">${fmtCOP(filteredTxns.filter((t) => t.estado === ESTADOS.COMPLETADO).reduce((s, t) => s + t.monto, 0))}</div></div>
          <div class="info-box"><div class="info-label">Comisiones</div><div class="info-val">${fmtCOP(filteredTxns.filter((t) => t.estado === ESTADOS.COMPLETADO).reduce((s, t) => s + (t.comision || 0), 0))}</div></div>
        </div>` : ""}
        <table>
          <thead><tr>${isBen ? "<th>Nombre</th><th>Doc.</th><th>Número</th><th>Cuentas</th><th>Celular</th><th>Correo</th>" : "<th>ID</th><th>Fecha y hora</th><th>Tipo</th><th>Descripción</th><th style='text-align:right'>Monto</th><th style='text-align:right'>Comisión</th><th>Estado</th>"}</tr></thead>
          <tbody>${isBen ? rowsBen : rowsTxn}</tbody>
        </table>
        ${(isBen ? bens : filteredTxns).length === 0 ? '<div style="text-align:center;padding:32px;color:#8a8981;font-size:13px">Sin registros para el período y filtros seleccionados.</div>' : ""}
      </div>
      <div class="footer">${EMPRESA.nombre} · NIT ${EMPRESA.nit} · Operado por ${EMPRESA.portal}<br>Generado el ${new Date().toLocaleDateString("es-CO", {day:"2-digit", month:"long", year:"numeric"})} · Este reporte es de uso interno.</div>
    </div></body></html>`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `Reporte-${tipoLabel.replace(/ /g, "-")}-${desde}-${hasta}.html`;
    a.click();
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "13px", outline: "none" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "5px" };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "16px", alignItems: "start" }}>
        {/* Tipos de reporte */}
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "12px" }}>Selecciona el tipo de reporte</div>
          {REPORT_TYPES.map((r) => (
            <div
              key={r.key}
              onClick={() => setSelected(r.key)}
              style={{ background: "var(--surface)", border: `1px solid ${selected === r.key ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", padding: "14px 16px", cursor: "pointer", marginBottom: "10px", display: "flex", alignItems: "center", gap: "14px", transition: ".12s" }}
            >
              <div style={{ width: "38px", height: "38px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0, background: selected === r.key ? "var(--accent-dim)" : "var(--elevated)", color: selected === r.key ? "var(--accent)" : r.color }}>
                <i className={`ti ${r.icon}`} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "2px" }}>{r.name}</div>
                <div style={{ fontSize: "11px", color: "var(--t3)" }}>{r.desc}</div>
              </div>
              <span style={{ fontSize: "11px", fontWeight: 600, background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", padding: "2px 10px", whiteSpace: "nowrap" }}>
                {counts[r.key]}
              </span>
            </div>
          ))}
        </div>

        {/* Panel de filtros */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "18px", boxShadow: "var(--shadow)", position: "sticky", top: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "16px", display: "flex", alignItems: "center", gap: "7px" }}>
            <i className="ti ti-filter" style={{ color: "var(--accent)" }} />Filtros del reporte
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Estado</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
              <option value="">Todos</option>
              <option value="Completado">Completado</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Rechazado">Rechazado</option>
            </select>
          </div>

          {/* Preview */}
          <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px 14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "8px" }}>Vista previa</div>
            {selected === "beneficiarios" ? (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "4px 0" }}>
                <span style={{ color: "var(--t3)" }}>Beneficiarios</span>
                <span style={{ fontWeight: 500 }}>{bens.length}</span>
              </div>
            ) : (
              [
                ["Registros", filteredTxns.length],
                ["Completados", filteredTxns.filter((t) => t.estado === ESTADOS.COMPLETADO).length],
                ["Monto total", fmt(filteredTxns.filter((t) => t.estado === ESTADOS.COMPLETADO).reduce((s, t) => s + t.monto, 0))],
                ["Comisiones", fmt(filteredTxns.filter((t) => t.estado === ESTADOS.COMPLETADO).reduce((s, t) => s + (t.comision || 0), 0))],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t3)" }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))
            )}
          </div>

          <button
            onClick={handleDownload}
            style={{ width: "100%", padding: "10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
          >
            <i className="ti ti-file-download" />Descargar reporte
          </button>
        </div>
      </div>
    </div>
  );
};