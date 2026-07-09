// src/pages/Movimientos.tsx
import React, { useState, useRef, useEffect } from "react";
import { useDataStore, calcSaldo, calcComision, genTxnId, fmtFechaHora } from "../store/dataStore";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ESTADOS, TIPOS, TARIFAS, type Txn, type ToastType } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

type Vista = "historial" | "nueva" | "exito";

export const MovimientosView: React.FC<Props> = ({ fmt, onToast }) => {
  const { txns, bens, addTxn, updateBenVol } = useDataStore();
  const [vista, setVista] = useState<Vista>("historial");
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [lastTxn, setLastTxn] = useState<Txn | null>(null);

  // Formulario nueva dispersión
  const [benQuery, setBenQuery]       = useState("");
  const [showBenList, setShowBenList] = useState(false);
  const [selectedBen, setSelectedBen] = useState<number | null>(null);
  const [selectedCta, setSelectedCta] = useState<number | null>(null);
  const [monto, setMonto]             = useState("");
  const benRef = useRef<HTMLDivElement>(null);

  const dispersiones = txns.filter((t) => t.tipo === TIPOS.ENVIADO);
  const saldo = calcSaldo(txns);
  const rawMonto = parseInt(monto.replace(/\D/g, "")) || 0;
  const comision = rawMonto > 0 ? calcComision(rawMonto) : null;

  const filtered = dispersiones.filter((d) => {
    const q = query.toLowerCase();
    const matchQ = !q || d.id.toLowerCase().includes(q) || (d.benNombre ?? "").toLowerCase().includes(q) || (d.llave ?? "").toLowerCase().includes(q) || (d.benNumdoc ?? "").includes(q);
    return matchQ && (!filterStatus || d.estado === filterStatus);
  });

  // Cierra dropdown si click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (benRef.current && !benRef.current.contains(e.target as Node)) setShowBenList(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const matchingBens = bens.filter((b) => {
    const q = benQuery.toLowerCase();
    return !q || b.nombre.toLowerCase().includes(q) || b.numdoc.includes(q);
  });

  const handleConfirmar = () => {
    if (selectedBen === null || selectedCta === null || rawMonto < 1) return;
    const b = bens[selectedBen];
    const c = b.cuentas[selectedCta];
    const com = calcComision(rawMonto);
    const txn: Txn = {
      id:       genTxnId("DSP", dispersiones.length + 1),
      tipo:     "Enviado",
      desc:     `${b.nombre} · ${c.banco}`,
      monto:    rawMonto,
      comision: com.total,
      total:    rawMonto + com.total,
      estado:   "Completado",
      fecha:    new Date(),
      divisa:   "COP",
      benNombre: b.nombre, benTipodoc: b.tipodoc, benNumdoc: b.numdoc,
      tipoCta: c.tipo, banco: c.banco, llave: c.llave,
      refBancaria: "REF-BRB-" + Math.floor(8800000 + Math.random() * 99999),
    };
    addTxn(txn);
    updateBenVol(b.id, rawMonto);
    setLastTxn(txn);
    setVista("exito");
  };

  const resetForm = () => {
    setBenQuery(""); setSelectedBen(null); setSelectedCta(null); setMonto(""); setShowBenList(false);
  };

  const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", fontSize: "13px" };
  const thStyle: React.CSSProperties = { padding: "9px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".5px", color: "var(--t3)", borderBottom: "1px solid var(--border)", textAlign: "left" as const };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none" };

  // ── Vista: éxito ──
  if (vista === "exito" && lastTxn) {
    const com = calcComision(lastTxn.monto);
    return (
      <div style={{ animation: "fadeUp .3s ease", maxWidth: "520px", margin: "0 auto" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "32px", textAlign: "center", boxShadow: "var(--shadow)" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "26px" }}>
            <i className="ti ti-circle-check" />
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>Dispersión exitosa</div>
          <div style={{ fontSize: "13px", color: "var(--t3)", marginBottom: "24px" }}>{lastTxn.id}</div>

          <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "16px", textAlign: "left", marginBottom: "20px" }}>
            {[
              ["Beneficiario",  lastTxn.benNombre ?? "—"],
              ["Documento",     `${lastTxn.benTipodoc} · ${lastTxn.benNumdoc}`],
              ["Tipo de cuenta", lastTxn.tipoCta ?? "—"],
              ["Banco",         lastTxn.banco ?? "—"],
              ["Llave / Número", lastTxn.llave ?? "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: "13px" }}>
                <span style={{ color: "var(--t3)" }}>{k}</span>
                <span style={{ fontWeight: 500, fontFamily: k === "Llave / Número" ? "var(--mono)" : undefined }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", fontSize: "16px", fontWeight: 700 }}>
              <span style={{ color: "var(--t2)" }}>Total debitado</span>
              <span style={{ color: "var(--error)" }}>{fmt((lastTxn.total ?? lastTxn.monto))}</span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--t3)" }}>
              {fmt(lastTxn.monto)} + comisión {fmt(com.total)}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => onToast("info", "Comprobante", `Generando PDF para ${lastTxn.id}`)}
              style={{ flex: 1, padding: "10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              <i className="ti ti-file-download" style={{ marginRight: "6px" }} />Comprobante
            </button>
            <button
              onClick={() => { resetForm(); setVista("historial"); }}
              style={{ flex: 1, padding: "10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              Ver historial
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista: nueva dispersión ──
  if (vista === "nueva") {
    const ben = selectedBen !== null ? bens[selectedBen] : null;
    const cta = (ben && selectedCta !== null) ? ben.cuentas[selectedCta] : null;
    return (
      <div style={{ animation: "fadeUp .3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
          <button
            onClick={() => { resetForm(); setVista("historial"); }}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "13px", cursor: "pointer" }}
          >
            ← Volver al historial
          </button>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>Nueva dispersión</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "1px" }}>Completa los datos y confirma para registrar</div>
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--shadow)" }}>
          {/* Billetera origen */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>Billetera origen</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--elevated)", fontSize: "13px", fontWeight: 500 }}>
              Peso colombiano
              <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--t3)" }}>
                Saldo disponible: <strong style={{ color: "var(--t1)" }}>{fmt(saldo)}</strong>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 9px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, color: "var(--accent)", background: "var(--accent-dim)" }}>Única disponible</span>
            </div>
          </div>

          {/* Buscador beneficiario */}
          <div style={{ marginBottom: "16px", position: "relative" }} ref={benRef}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
              Beneficiario <span style={{ color: "var(--accent)" }}>*</span>
            </label>

            {ben ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", background: "var(--success-dim)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{ben.nombre}</div>
                  <div style={{ fontSize: "12px", color: "var(--t3)" }}>{ben.tipodoc} · {ben.numdoc}</div>
                </div>
                <button
                  onClick={() => { setSelectedBen(null); setSelectedCta(null); setBenQuery(""); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer" }}
                >
                  <i className="ti ti-x" /> Cambiar
                </button>
              </div>
            ) : (
              <>
                <input
                  value={benQuery}
                  onChange={(e) => setBenQuery(e.target.value)}
                  onFocus={() => setShowBenList(true)}
                  placeholder="Buscar por nombre o número de documento..."
                  style={inputStyle}
                />
                {showBenList && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow)", zIndex: 50, maxHeight: "200px", overflowY: "auto", marginTop: "3px" }}>
                    {matchingBens.length === 0 ? (
                      <div style={{ padding: "12px 14px", fontSize: "12px", color: "var(--t3)" }}>No se encontraron beneficiarios</div>
                    ) : matchingBens.map((b) => (
                      <div
                        key={b.id}
                        onClick={() => { setSelectedBen(bens.indexOf(b)); setSelectedCta(null); setShowBenList(false); setBenQuery(""); }}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: "12px" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ fontWeight: 500 }}>{b.nombre}</div>
                        <div style={{ color: "var(--t3)", marginTop: "2px" }}>{b.tipodoc} · {b.numdoc}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Selector de cuenta */}
          {ben && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
                Cuenta destino <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <select
                value={selectedCta ?? ""}
                onChange={(e) => setSelectedCta(e.target.value === "" ? null : Number(e.target.value))}
                style={inputStyle}
              >
                <option value="">Selecciona la cuenta destino...</option>
                {ben.cuentas.map((c, i) => (
                  <option key={i} value={i}>
                    {c.tipo === "Bre-B" ? `Bre-B · ${c.llave}` : `${c.tipo} · ${c.banco} · ${c.llave}`}
                  </option>
                ))}
              </select>

              {cta && (
                <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[["Tipo", cta.tipo], ["Banco", cta.banco], ["Llave", cta.llave]].map(([k, v]) => (
                    <div key={k} style={{ padding: "5px 10px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "12px" }}>
                      <span style={{ color: "var(--t3)" }}>{k}:</span>{" "}
                      <span style={{ fontWeight: 500, fontFamily: k === "Llave" ? "var(--mono)" : undefined }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Monto */}
          {cta && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
                Monto a dispersar <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontWeight: 600 }}>$</span>
                <input
                  value={monto}
                  onChange={(e) => { const c = e.target.value.replace(/\D/g, ""); setMonto(c ? Number(c).toLocaleString("es-CO") : ""); }}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ ...inputStyle, paddingLeft: "26px" }}
                />
              </div>
            </div>
          )}

          {/* Resumen */}
          {comision && rawMonto > 0 && (
            <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: "16px" }}>
              {[
                ["Monto a enviar",    fmt(rawMonto)],
                ["Cargo fijo",        fmt(TARIFAS.CARGO_FIJO)],
                [`Variable (${(TARIFAS.VARIABLE_PCT*100).toFixed(2)}%)`, fmt(comision.variable)],
                ["Total comisión",    fmt(comision.total)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t3)" }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: "15px", fontWeight: 700 }}>
                <span style={{ color: "var(--t2)" }}>Total a débitar</span>
                <span style={{ color: "var(--error)" }}>{fmt(rawMonto + comision.total)}</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button onClick={() => { resetForm(); setVista("historial"); }} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={!ben || !cta || rawMonto < 1}
              style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: (!ben || !cta || rawMonto < 1) ? "not-allowed" : "pointer", opacity: (!ben || !cta || rawMonto < 1) ? 0.5 : 1 }}
            >
              <i className="ti ti-send" style={{ marginRight: "6px" }} />Confirmar dispersión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista: historial ──
  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "18px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600 }}>Registros de Dispersiones Realizadas</div>
          <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>{dispersiones.length} registro(s) guardado(s)</div>
        </div>
        <button
          onClick={() => { resetForm(); setVista("nueva"); }}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
        >
          <i className="ti ti-send" />Dispersar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "9px", marginBottom: "14px" }}>
        <div style={{ position: "relative", flex: 2 }}>
          <i className="ti ti-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: "14px" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por ID, beneficiario o número de cuenta..." style={{ ...inputStyle, paddingLeft: "30px" }} />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontSize: "13px" }}>
          <option value="">Todos los estados</option>
          <option value="Completado">Completado</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Fallido">Fallido</option>
        </select>
      </div>

      {/* Tabla */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px", color: "var(--t3)" }}>
            <i className="ti ti-send" style={{ fontSize: "28px", display: "block", marginBottom: "10px", opacity: .3 }} />
            Aún no hay dispersiones. Haz clic en <strong>Dispersar</strong> para comenzar.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ID", "Estado", "Tipo Doc.", "Identificación", "Beneficiario", "Tipo Cuenta", "Banco", "No. Cuenta", "Monto", ""].map((h) => (
                    <th key={h} style={{ ...thStyle, textAlign: h === "Monto" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 500 }}>{d.id}</div>
                      <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>{fmtFechaHora(d.fecha)}</div>
                    </td>
                    <td style={tdStyle}><StatusBadge value={d.estado} /></td>
                    <td style={{ ...tdStyle, fontSize: "12px" }}>{d.benTipodoc}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)", fontSize: "12px" }}>{d.benNumdoc}</td>
                    <td style={{ ...tdStyle, fontWeight: 500, fontSize: "12px" }}>{d.benNombre}</td>
                    <td style={tdStyle}><StatusBadge value={d.tipoCta ?? ""} /></td>
                    <td style={{ ...tdStyle, fontSize: "12px" }}>{d.banco}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)", fontSize: "11px" }}>{d.llave}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.monto)}</td>
                    <td style={tdStyle}>
                      {d.estado === ESTADOS.COMPLETADO && (
                        <button onClick={() => onToast("info", "Comprobante", `PDF para ${d.id}`)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "7px", padding: "4px 7px", cursor: "pointer", color: "var(--accent)", fontSize: "13px" }} title="Descargar comprobante">
                          <i className="ti ti-file-download" />
                        </button>
                      )}
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