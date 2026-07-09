// src/pages/Beneficiarios.tsx
import React, { useState } from "react";
import { useDataStore } from "../store/dataStore";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import type { ToastType, BenCuenta } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

const BANCOS = ["Bancolombia","Davivienda","Banco de Bogotá","BBVA Colombia","Scotiabank Colpatria","Banco Popular","Nequi","Daviplata","Otro"];

function iniciales(nombre: string): string {
  return nombre.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export const BeneficiariosView: React.FC<Props> = ({ fmt, onToast }) => {
  const { bens, addBen, deleteBen, addCuenta, deleteCuenta } = useDataStore();
  const [query, setQuery]         = useState("");
  const [openIds, setOpenIds]     = useState<Set<number>>(new Set([bens[0]?.id]));
  const [newBenOpen, setNewBenOpen] = useState(false);
  const [newCtaTarget, setNewCtaTarget] = useState<number | null>(null);

  // Formulario nuevo beneficiario
  const [bForm, setBForm] = useState({ tipodoc:"CC", numdoc:"", nombre:"", celular:"", correo:"", llave:"" });
  // Formulario nueva cuenta
  const [ctaForm, setCtaForm] = useState<{ tipo:"Bre-B"|"Ahorros"|"Corriente"|""; banco:string; num:string; llave:string }>({ tipo:"", banco:"", num:"", llave:"" });

  const bf = (k: keyof typeof bForm) => (v: string) => setBForm((p) => ({ ...p, [k]: v }));
  const cf = (k: keyof typeof ctaForm) => (v: string) => setCtaForm((p) => ({ ...p, [k]: v }));

  const filtered = bens.filter((b) => {
    const q = query.toLowerCase();
    return !q || b.nombre.toLowerCase().includes(q) || b.numdoc.includes(q) || b.cuentas.some((c) => c.banco.toLowerCase().includes(q) || c.llave.toLowerCase().includes(q));
  });

  const toggleOpen = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSaveBen = () => {
    if (!bForm.tipodoc || !bForm.numdoc || !bForm.nombre || !bForm.llave) {
      onToast("error", "Campos requeridos", "Completa todos los campos obligatorios");
      return;
    }
    addBen({
      nombre: bForm.nombre, tipodoc: bForm.tipodoc, numdoc: bForm.numdoc,
      indicativo: "+57", celular: bForm.celular, correo: bForm.correo,
      cuentas: [{ tipo: "Bre-B", banco: "Ramplix", llave: bForm.llave, estado: "Activa" }],
      vol: { d: 0, m: 0, a: 0 },
    });
    onToast("ok", "Beneficiario guardado", bForm.nombre);
    setBForm({ tipodoc:"CC", numdoc:"", nombre:"", celular:"", correo:"", llave:"" });
    setNewBenOpen(false);
  };

  const handleSaveCta = () => {
    if (newCtaTarget === null || !ctaForm.tipo) return;
    const cuenta: BenCuenta = ctaForm.tipo === "Bre-B"
      ? { tipo:"Bre-B", banco:"Ramplix", llave:ctaForm.llave, estado:"Activa" }
      : { tipo:ctaForm.tipo, banco:ctaForm.banco, llave:ctaForm.num, estado:"Activa" };
    addCuenta(newCtaTarget, cuenta);
    onToast("ok", "Cuenta agregada", `${cuenta.tipo} · ${cuenta.banco}`);
    setCtaForm({ tipo:"", banco:"", num:"", llave:"" });
    setNewCtaTarget(null);
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "13px", outline: "none" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "5px" };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
        {[
          { label: "Total Beneficiarios", value: bens.length, icon: "ti-users", color: "var(--accent)" },
          { label: "Total Cuentas", value: bens.reduce((s, b) => s + b.cuentas.length, 0), icon: "ti-credit-card", color: "var(--success)" },
        ].map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px", boxShadow: "var(--shadow)" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--elevated)", display: "grid", placeItems: "center", color: s.color, flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: "18px" }} />
            </div>
            <div>
              <div style={{ fontSize: "22px", fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "3px" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Barra de búsqueda */}
      <div style={{ display: "flex", gap: "9px", marginBottom: "14px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <i className="ti ti-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: "14px" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, documento o banco..." style={{ ...inputStyle, paddingLeft: "30px" }} />
        </div>
        <button onClick={() => setQuery("")} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer", fontSize: "13px" }}>Limpiar</button>
        <button onClick={() => setNewBenOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
          <i className="ti ti-plus" />Nuevo Beneficiario
        </button>
      </div>

      <div style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px" }}>
        Lista de Beneficiarios
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--t3)", fontSize: "13px" }}>No se encontraron beneficiarios</div>
      ) : (
        filtered.map((b) => {
          const isOpen = openIds.has(b.id);
          return (
            <div key={b.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: "10px", overflow: "hidden", background: "var(--surface)" }}>
              {/* Header */}
              <div
                onClick={() => toggleOpen(b.id)}
                style={{ display: "flex", alignItems: "center", padding: "12px 16px", cursor: "pointer", gap: "12px" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
                  {iniciales(b.nombre)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>{b.nombre}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
                    <span style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "3px", padding: "1px 5px", fontSize: "9px", color: "var(--t3)" }}>{b.tipodoc}</span>
                    <span style={{ fontSize: "10px", color: "var(--t3)" }}>{b.numdoc}</span>
                    {b.celular && <><span style={{ fontSize: "10px", color: "var(--t3)" }}>·</span><span style={{ fontSize: "10px", color: "var(--t3)" }}>{b.indicativo} {b.celular}</span></>}
                    {b.correo && <><span style={{ fontSize: "10px", color: "var(--t3)" }}>·</span><span style={{ fontSize: "10px", color: "var(--t3)" }}>{b.correo}</span></>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  <span style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "11px", color: "var(--t2)", padding: "2px 9px" }}>
                    {b.cuentas.length} cuenta{b.cuentas.length !== 1 ? "s" : ""}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm("¿Eliminar este beneficiario?")) { deleteBen(b.id); onToast("ok", "Eliminado", b.nombre); } }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "16px", padding: "2px" }}>
                    <i className="ti ti-trash" />
                  </button>
                  <i className={`ti ${isOpen ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ color: "var(--t3)", fontSize: "14px" }} />
                </div>
              </div>

              {/* Body expandible */}
              {isOpen && (
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  {/* Datos titular */}
                  <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "10px" }}>Datos del Titular</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                      {[["Nombre completo", b.nombre, false], ["Tipo documento", b.tipodoc, false], ["Número documento", b.numdoc, true], ["Celular", b.celular ? `${b.indicativo} ${b.celular}` : "—", false], ["Correo", b.correo || "—", false]].map(([lbl, val, mono]) => (
                        <div key={String(lbl)} style={{ background: "var(--elevated)", borderRadius: "var(--radius-sm)", padding: "8px 11px" }}>
                          <div style={{ fontSize: "9px", color: "var(--t3)", marginBottom: "2px" }}>{lbl}</div>
                          <div style={{ fontSize: "12px", fontWeight: 500, fontFamily: mono ? "var(--mono)" : undefined }}>{String(val)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Volumen */}
                  <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "10px" }}>Volumen de dispersiones · COP</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
                      {[["Diario", b.vol.d], ["Mensual", b.vol.m], ["Anual", b.vol.a]].map(([lbl, val]) => (
                        <div key={String(lbl)} style={{ background: "var(--elevated)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                          <div style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "4px" }}>{lbl}</div>
                          <div style={{ fontSize: "13px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmt(Number(val))}</div>
                          <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>Dispersado</div>
                          <div style={{ height: "4px", background: "var(--surface)", borderRadius: "3px", overflow: "hidden", marginTop: "6px" }}>
                            <div style={{ height: "100%", borderRadius: "3px", background: "var(--accent)", width: Number(val) > 0 ? "60%" : "0%" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cuentas */}
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--t2)" }}>Cuentas bancarias</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setNewCtaTarget(b.id); setCtaForm({ tipo:"", banco:"", num:"", llave:"" }); }}
                        style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer" }}
                      >
                        <i className="ti ti-plus" /> Agregar cuenta
                      </button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr>
                          {["Banco","Tipo","Número / Llave","Estado",""].map((h) => (
                            <th key={h} style={{ padding: "7px 10px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const, color: "var(--t3)", borderBottom: "1px solid var(--border)", textAlign: "left" as const }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.cuentas.map((c, ci) => (
                          <tr key={ci}>
                            <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)" }}>{c.banco}</td>
                            <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)" }}><StatusBadge value={c.tipo} /></td>
                            <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)", fontFamily: "var(--mono)", fontSize: "11px" }}>{c.llave}</td>
                            <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)" }}><StatusBadge value={c.estado} /></td>
                            <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)" }}>
                              <button onClick={() => { if (confirm("¿Eliminar esta cuenta?")) { deleteCuenta(b.id, ci); onToast("ok", "Cuenta eliminada", c.banco); } }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "14px" }}>
                                <i className="ti ti-trash" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Modal nuevo beneficiario */}
      <Modal isOpen={newBenOpen} onClose={() => setNewBenOpen(false)} title="Nuevo Beneficiario" subtitle="Completa los datos del titular y su cuenta bancaria"
        footer={
          <>
            <button onClick={() => setNewBenOpen(false)} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleSaveBen} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer" }}>
              <i className="ti ti-check" style={{ marginRight: "6px" }} />Guardar beneficiario
            </button>
          </>
        }
      >
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "10px", paddingBottom: "7px", borderBottom: "1px solid var(--border)" }}>Detalle del Titular</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div><label style={labelStyle}>Tipo de Documento <span style={{ color: "var(--accent)" }}>*</span></label>
            <select value={bForm.tipodoc} onChange={(e) => bf("tipodoc")(e.target.value)} style={inputStyle}>
              <option value="CC">Cédula (CC)</option><option value="CE">Cédula extranjería (CE)</option><option value="PA">Pasaporte</option><option value="NIT">NIT</option>
            </select>
          </div>
          <div><label style={labelStyle}>Número de Documento <span style={{ color: "var(--accent)" }}>*</span></label>
            <input value={bForm.numdoc} onChange={(e) => bf("numdoc")(e.target.value)} placeholder="Ej. 1023456789" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: "12px" }}><label style={labelStyle}>Nombre del Titular <span style={{ color: "var(--accent)" }}>*</span></label>
          <input value={bForm.nombre} onChange={(e) => bf("nombre")(e.target.value)} placeholder="Nombre completo del titular" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div><label style={labelStyle}>Celular (opcional)</label>
            <input value={bForm.celular} onChange={(e) => bf("celular")(e.target.value)} placeholder="300 000 0000" style={inputStyle} />
          </div>
          <div><label style={labelStyle}>Correo (opcional)</label>
            <input value={bForm.correo} onChange={(e) => bf("correo")(e.target.value)} placeholder="correo@ejemplo.com" style={inputStyle} />
          </div>
        </div>
        <div style={{ height: "1px", background: "var(--border)", margin: "14px 0" }} />
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "10px", paddingBottom: "7px", borderBottom: "1px solid var(--border)" }}>Llave Bre-B</div>
        <div><label style={labelStyle}>Llave Bre-B <span style={{ color: "var(--accent)" }}>*</span></label>
          <input value={bForm.llave} onChange={(e) => bf("llave")(e.target.value)} placeholder="Ej. nombre@breb.co" style={inputStyle} />
          <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>Ingresa la llave — consultaremos el banco automáticamente</div>
        </div>
      </Modal>

      {/* Modal agregar cuenta */}
      <Modal isOpen={newCtaTarget !== null} onClose={() => setNewCtaTarget(null)} title="Agregar cuenta bancaria" subtitle={newCtaTarget !== null ? bens.find((b) => b.id === newCtaTarget)?.nombre : ""}
        footer={
          <>
            <button onClick={() => setNewCtaTarget(null)} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleSaveCta} disabled={!ctaForm.tipo} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: !ctaForm.tipo ? "not-allowed" : "pointer", opacity: !ctaForm.tipo ? 0.5 : 1 }}>
              <i className="ti ti-plus" style={{ marginRight: "6px" }} />Agregar cuenta
            </button>
          </>
        }
      >
        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Tipo de Cuenta <span style={{ color: "var(--accent)" }}>*</span></label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
            {[{tipo:"Ahorros" as const, icon:"ti-piggy-bank"}, {tipo:"Corriente" as const, icon:"ti-building-bank"}, {tipo:"Bre-B" as const, icon:"ti-key"}].map((opt) => (
              <button
                key={opt.tipo}
                onClick={() => cf("tipo")(opt.tipo)}
                style={{ border: `1.5px solid ${ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--border)"}`, background: ctaForm.tipo === opt.tipo ? "var(--accent-dim)" : "transparent", borderRadius: "var(--radius-sm)", padding: "10px 8px", cursor: "pointer", textAlign: "center" }}
              >
                <i className={`ti ${opt.icon}`} style={{ fontSize: "17px", color: ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--t3)", display: "block", marginBottom: "4px" }} />
                <div style={{ fontSize: "11px", fontWeight: 500, color: ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--t3)" }}>{opt.tipo}</div>
              </button>
            ))}
          </div>
        </div>
        {(ctaForm.tipo === "Ahorros" || ctaForm.tipo === "Corriente") && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div><label style={labelStyle}>Banco <span style={{ color: "var(--accent)" }}>*</span></label>
              <select value={ctaForm.banco} onChange={(e) => cf("banco")(e.target.value)} style={inputStyle}>
                <option value="">Selecciona...</option>
                {BANCOS.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Número <span style={{ color: "var(--accent)" }}>*</span></label>
              <input value={ctaForm.num} onChange={(e) => cf("num")(e.target.value)} placeholder="Ej. 4830-0005-5400" style={inputStyle} />
            </div>
          </div>
        )}
        {ctaForm.tipo === "Bre-B" && (
          <div><label style={labelStyle}>Llave Bre-B <span style={{ color: "var(--accent)" }}>*</span></label>
            <input value={ctaForm.llave} onChange={(e) => cf("llave")(e.target.value)} placeholder="Ej. nombre@breb.co" style={inputStyle} />
          </div>
        )}
      </Modal>
    </div>
  );
};