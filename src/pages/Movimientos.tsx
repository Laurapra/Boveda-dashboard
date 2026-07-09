// src/pages/Movimientos.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useDataStore, calcComision } from "../store/dataStore";
import { StatusBadge } from "../components/ui/StatusBadge";
import { sendPayoutBreb } from "../lib/bepayClient";
import type { ToastType } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

interface BepayTx {
  id: string;
  bepay_ide: string | null;
  type: "charge" | "payout";
  amount: number;
  concept: string;
  status: string;
  ben_name: string | null;
  ben_doc_type: string | null;
  ben_doc_number: string | null;
  account_type: string | null;
  bank_name: string | null;
  account_key: string | null;
  tarifa_aplicada: number | null;
  comision_total: number | null;
  created_at: string;
}

type Vista = "historial" | "nueva" | "exito";

export const MovimientosView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user }   = useAuthStore();
  const { bens }   = useDataStore();
  const isAdmin    = user?.role === "admin";

  const [vista, setVista]           = useState<Vista>("historial");
  const [txns, setTxns]             = useState<BepayTx[]>([]);
  const [loading, setLoading]       = useState(true);
  const [query, setQuery]           = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [lastTxn, setLastTxn]       = useState<BepayTx | null>(null);

  // Formulario nueva dispersión
  const [benQuery, setBenQuery]       = useState("");
  const [showBenList, setShowBenList] = useState(false);
  const [selectedBen, setSelectedBen] = useState<number | null>(null);
  const [selectedCta, setSelectedCta] = useState<number | null>(null);
  const [monto, setMonto]             = useState("");
  const [saving, setSaving]           = useState(false);
  const benRef = useRef<HTMLDivElement>(null);

  const rawMonto  = parseInt(monto.replace(/\D/g, "")) || 0;
  const comision  = rawMonto > 0 ? calcComision(rawMonto) : null;
  const dispersiones = txns.filter(t => t.type === "payout");

  // ── Cargar transacciones reales ───────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("bepay_transactions")
      .select("id, bepay_ide, type, amount, concept, status, ben_name, ben_doc_type, ben_doc_number, account_type, bank_name, account_key, tarifa_aplicada, comision_total, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!isAdmin) q = q.eq("user_id", user.id);
    const { data } = await q;
    setTxns((data ?? []) as BepayTx[]);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("mov-rt")
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "bepay_transactions",
        ...(isAdmin ? {} : { filter: `user_id=eq.${user.id}` }),
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, isAdmin, load]);

  // Cierra dropdown
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (benRef.current && !benRef.current.contains(e.target as Node)) setShowBenList(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  const matchingBens = bens.filter(b => {
    const q = benQuery.toLowerCase();
    return !q || b.nombre.toLowerCase().includes(q) || b.numdoc.includes(q);
  });

  const filtered = dispersiones.filter(d => {
    const q = query.toLowerCase();
    const matchQ = !q
      || d.id.toLowerCase().includes(q)
      || (d.ben_name ?? "").toLowerCase().includes(q)
      || (d.account_key ?? "").toLowerCase().includes(q)
      || (d.ben_doc_number ?? "").includes(q);
    const matchS = !filterStatus || d.status === filterStatus;
    return matchQ && matchS;
  });

  // ── Confirmar dispersión real via Bepay ───────────────────────
  const handleConfirmar = async () => {
    if (selectedBen === null || selectedCta === null || rawMonto < 1) return;
    const b = bens[selectedBen];
    const c = b.cuentas[selectedCta];
    if (c.tipo !== "Bre-B") { onToast("error", "Solo Bre-B", "Por ahora solo se permiten dispersiones Bre-B"); return; }

    setSaving(true);
    try {
      const res = await sendPayoutBreb(c.llave, rawMonto, `Dispersión a ${b.nombre}`, `DISP-${Date.now()}`);
      if (res?.success === false) {
        onToast("error", "Bepay rechazó la dispersión", typeof res.message === "string" ? res.message : JSON.stringify(res.message));
        return;
      }
      onToast("ok", "Dispersión enviada", `${fmt(rawMonto)} → ${b.nombre}`);
      await load();
      // Mostrar pantalla de éxito con datos simulados para el comprobante
      setLastTxn({
        id: `DISP-${Date.now()}`, bepay_ide: res?.data?.ide ?? null,
        type: "payout", amount: rawMonto, concept: `Dispersión a ${b.nombre}`,
        status: "PENDING", ben_name: b.nombre,
        ben_doc_type: b.tipodoc, ben_doc_number: b.numdoc,
        account_type: c.tipo, bank_name: c.banco, account_key: c.llave,
        tarifa_aplicada: null, comision_total: comision?.total ?? null,
        created_at: new Date().toISOString(),
      });
      setVista("exito");
    } catch (err: any) {
      onToast("error", "Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setBenQuery(""); setSelectedBen(null); setSelectedCta(null);
    setMonto(""); setShowBenList(false);
  };

  const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", fontSize: "13px" };
  const thStyle: React.CSSProperties = { padding: "9px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".5px", color: "var(--t3)", borderBottom: "1px solid var(--border)", textAlign: "left" as const };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none" };

  const statusLabel = (s: string) =>
    s === "APPROVED" || s === "COMPLETED" ? "Completado"
    : s === "PENDING" ? "Pendiente"
    : s === "DECLINED" || s === "FAILED" ? "Rechazado" : s;

  const statusColor = (s: string) =>
    s === "APPROVED" || s === "COMPLETED" ? "var(--success)"
    : s === "PENDING" ? "var(--warning)" : "var(--error)";

  const statusBg = (s: string) =>
    s === "APPROVED" || s === "COMPLETED" ? "var(--success-dim)"
    : s === "PENDING" ? "var(--warning-dim)" : "var(--error-dim)";

  // ── Vista éxito ───────────────────────────────────────────────
  if (vista === "exito" && lastTxn) {
    return (
      <div style={{ animation: "fadeUp .3s ease", maxWidth: "520px", margin: "0 auto" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "32px", textAlign: "center", boxShadow: "var(--shadow)" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "26px" }}>
            <i className="ti ti-circle-check" />
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px", color: "var(--t1)" }}>Dispersión enviada</div>
          <div style={{ fontSize: "13px", color: "var(--t3)", marginBottom: "24px" }}>{lastTxn.bepay_ide ?? lastTxn.id}</div>

          <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "16px", textAlign: "left", marginBottom: "20px" }}>
            {[
              ["Beneficiario",   lastTxn.ben_name ?? "—"],
              ["Documento",      `${lastTxn.ben_doc_type} · ${lastTxn.ben_doc_number}`],
              ["Tipo de cuenta", lastTxn.account_type ?? "—"],
              ["Banco",          lastTxn.bank_name ?? "—"],
              ["Llave / Número", lastTxn.account_key ?? "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: "13px" }}>
                <span style={{ color: "var(--t3)" }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", fontSize: "16px", fontWeight: 700 }}>
              <span style={{ color: "var(--t2)" }}>Total debitado</span>
              <span style={{ color: "var(--error)" }}>{fmt(lastTxn.amount + (lastTxn.comision_total ?? 0))}</span>
            </div>
            {lastTxn.comision_total && (
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                {fmt(lastTxn.amount)} + comisión {fmt(lastTxn.comision_total)}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
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

  // ── Vista nueva dispersión ────────────────────────────────────
  if (vista === "nueva") {
    const ben = selectedBen !== null ? bens[selectedBen] : null;
    const cta = (ben && selectedCta !== null) ? ben.cuentas[selectedCta] : null;

    return (
      <div style={{ animation: "fadeUp .3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
          <button onClick={() => { resetForm(); setVista("historial"); }} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "13px", cursor: "pointer" }}>
            ← Volver al historial
          </button>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Nueva dispersión</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "1px" }}>Completa los datos y confirma</div>
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--shadow)" }}>

          {/* Buscador beneficiario */}
          <div style={{ marginBottom: "16px", position: "relative" }} ref={benRef}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
              Beneficiario <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            {ben ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", background: "var(--success-dim)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--t1)" }}>{ben.nombre}</div>
                  <div style={{ fontSize: "12px", color: "var(--t3)" }}>{ben.tipodoc} · {ben.numdoc}</div>
                </div>
                <button onClick={() => { setSelectedBen(null); setSelectedCta(null); setBenQuery(""); }} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer" }}>
                  <i className="ti ti-x" /> Cambiar
                </button>
              </div>
            ) : (
              <>
                <input value={benQuery} onChange={(e) => setBenQuery(e.target.value)} onFocus={() => setShowBenList(true)} placeholder="Buscar por nombre o documento..." style={inputStyle} />
                {showBenList && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow)", zIndex: 50, maxHeight: "200px", overflowY: "auto", marginTop: "3px" }}>
                    {matchingBens.length === 0 ? (
                      <div style={{ padding: "12px 14px", fontSize: "12px", color: "var(--t3)" }}>Sin beneficiarios</div>
                    ) : matchingBens.map((b) => (
                      <div key={b.id} onClick={() => { setSelectedBen(bens.indexOf(b)); setSelectedCta(null); setShowBenList(false); setBenQuery(""); }}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: "12px" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ fontWeight: 500, color: "var(--t1)" }}>{b.nombre}</div>
                        <div style={{ color: "var(--t3)", marginTop: "2px" }}>{b.tipodoc} · {b.numdoc}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Selector cuenta */}
          {ben && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
                Cuenta destino <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <select value={selectedCta ?? ""} onChange={(e) => setSelectedCta(e.target.value === "" ? null : Number(e.target.value))} style={inputStyle}>
                <option value="">Selecciona la cuenta...</option>
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
              {cta && cta.tipo !== "Bre-B" && (
                <div style={{ marginTop: "8px", padding: "8px 12px", background: "var(--warning-dim)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--warning)" }}>
                  ⚠️ Solo se permiten dispersiones Bre-B por ahora
                </div>
              )}
            </div>
          )}

          {/* Monto */}
          {cta && cta.tipo === "Bre-B" && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
                Monto <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontWeight: 600 }}>$</span>
                <input value={monto} onChange={(e) => { const c = e.target.value.replace(/\D/g, ""); setMonto(c ? Number(c).toLocaleString("es-CO") : ""); }} placeholder="0" inputMode="numeric" style={{ ...inputStyle, paddingLeft: "26px" }} />
              </div>
            </div>
          )}

          {/* Resumen tarifa */}
          {comision && rawMonto > 0 && (
            <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: "16px" }}>
              {[
                ["Monto a enviar",   fmt(rawMonto)],
                ["Cargo fijo",       fmt(comision.fijo)],
                ["Variable",         fmt(comision.variable)],
                ["Total comisión",   fmt(comision.total)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t3)" }}>{k}</span>
                  <span style={{ fontWeight: 500, color: "var(--t1)" }}>{v}</span>
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
              disabled={!ben || !cta || cta.tipo !== "Bre-B" || rawMonto < 1000 || saving}
              style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer", opacity: (!ben || !cta || cta.tipo !== "Bre-B" || rawMonto < 1000 || saving) ? 0.5 : 1 }}
            >
              {saving ? "Enviando…" : <><i className="ti ti-send" style={{ marginRight: "6px" }} />Confirmar dispersión</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista historial ───────────────────────────────────────────
  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "18px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Registros de Dispersiones</div>
          <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>{dispersiones.length} registro(s)</div>
        </div>
        <button onClick={() => { resetForm(); setVista("nueva"); }} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
          <i className="ti ti-send" />Dispersar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "9px", marginBottom: "14px" }}>
        <div style={{ position: "relative", flex: 2 }}>
          <i className="ti ti-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: "14px" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por ID, beneficiario o cuenta..." style={{ ...inputStyle, paddingLeft: "30px" }} />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontSize: "13px" }}>
          <option value="">Todos los estados</option>
          <option value="APPROVED">Completado</option>
          <option value="PENDING">Pendiente</option>
          <option value="DECLINED">Rechazado</option>
        </select>
        <button onClick={load} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer", fontSize: "13px" }}>
          <i className="ti ti-refresh" />
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px", color: "var(--t3)" }}>
            <i className="ti ti-send" style={{ fontSize: "28px", display: "block", marginBottom: "10px", opacity: .3 }} />
            {dispersiones.length === 0 ? "Aún no hay dispersiones. Haz clic en Dispersar para comenzar." : "Sin resultados para los filtros aplicados."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Fecha", "Estado", "Beneficiario", "Cuenta", "Banco", "Monto", "Comisión", ""].map((h) => (
                    <th key={h} style={{ ...thStyle, textAlign: h === "Monto" || h === "Comisión" ? "right" : "left" }}>{h}</th>
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
                      <div style={{ fontSize: "12px", color: "var(--t1)" }}>
                        {new Date(d.created_at).toLocaleDateString("es-CO", { day:"2-digit", month:"short" })}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--t3)" }}>
                        {new Date(d.created_at).toLocaleTimeString("es-CO", { hour:"2-digit", minute:"2-digit" })}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 500, color: statusColor(d.status), background: statusBg(d.status) }}>
                        {statusLabel(d.status)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500, color: "var(--t1)" }}>{d.ben_name ?? "—"}</td>
                    <td style={tdStyle}>{d.account_type ?? "—"}</td>
                    <td style={{ ...tdStyle, fontSize: "12px", color: "var(--t2)" }}>{d.bank_name ?? "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "var(--error)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.amount)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>
                      {d.comision_total ? fmt(d.comision_total) : "—"}
                    </td>
                    <td style={tdStyle}>
                      {(d.status === "APPROVED" || d.status === "COMPLETED") && (
                        <button onClick={() => onToast("info", "Comprobante", `PDF para ${d.bepay_ide ?? d.id}`)}
                          style={{ background: "none", border: "1px solid var(--border)", borderRadius: "7px", padding: "4px 7px", cursor: "pointer", color: "var(--accent)", fontSize: "13px" }}>
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