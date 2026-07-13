// src/pages/Movimientos.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useBeneficiaries, type Beneficiary, type BenAccount } from "../hooks/useBeneficiaries";
import { sendPayoutBreb, sendPayoutAch, getBankCodes } from "../lib/bepayClient";
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

interface BankCode {
  code: string;
  name: string;
}

type Vista = "historial" | "nueva" | "exito";

function calcComisionLocal(amount: number, fijo: number, variablePct: number) {
  const variable = Math.round(amount * variablePct);
  return { fijo, variable, total: fijo + variable };
}

export const MovimientosView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const { beneficiaries, loading: bensLoading, refetch: refetchBens } = useBeneficiaries();

  const [vista, setVista] = useState<Vista>("historial");
  const [txns, setTxns] = useState<BepayTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [lastTxn, setLastTxn] = useState<BepayTx | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  // Formulario nueva dispersión
  const [benQuery, setBenQuery] = useState("");
  const [showBenList, setShowBenList] = useState(false);
  const [selectedBenId, setSelectedBenId] = useState<string | null>(null);
  const [selectedCtaId, setSelectedCtaId] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [saving, setSaving] = useState(false);
  const benRef = useRef<HTMLDivElement>(null);

  // Bancos reales para ACH
  const [bankCodes, setBankCodes] = useState<BankCode[]>([]);

  const tarifaFijo = user?.tarifa_enviar ?? 1190;
  const tarifaVariable = user?.tarifa_variable ?? 0.0012;

  const rawMonto = parseInt(monto.replace(/\D/g, "")) || 0;
  const comision = rawMonto > 0 ? calcComisionLocal(rawMonto, tarifaFijo, tarifaVariable) : null;
  const dispersiones = txns.filter(function (t) { return t.type === "payout"; });

  // ── Verificar onboarding antes de permitir dispersar ────────────
  const checkOnboarding = useCallback(async () => {
    if (!user) return;
    if (user.role === "admin") { setBlocked(null); return; }

    const pnRes = await supabase.from("onboarding_pn").select("status").eq("user_id", user.id).single();
    const empRes = await supabase.from("onboarding_emp").select("status").eq("user_id", user.id).single();
    const ob = pnRes.data || empRes.data;

    if (!ob) {
      setBlocked("Debes completar el Onboarding Bre-B antes de dispersar.");
    } else if (ob.status !== "approved") {
      if (ob.status === "pending") setBlocked("Tu onboarding está pendiente de aprobación.");
      else if (ob.status === "in_review") setBlocked("Tu onboarding está en revisión.");
      else setBlocked("Tu onboarding fue rechazado. Envía uno nuevo.");
    } else {
      setBlocked(null);
    }
  }, [user]);

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

  useEffect(() => { load(); checkOnboarding(); }, [load, checkOnboarding]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("mov-rt")
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "bepay_transactions",
        ...(isAdmin ? {} : { filter: "user_id=eq." + user.id }),
      }, function () { load(); })
      .subscribe();
    return function () { supabase.removeChannel(ch); };
  }, [user, isAdmin, load]);

  // Cierra dropdown de búsqueda al hacer clic afuera
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (benRef.current && !benRef.current.contains(e.target as Node)) setShowBenList(false);
    };
    document.addEventListener("click", h);
    return function () { document.removeEventListener("click", h); };
  }, []);

  // Cargar bancos reales al entrar al formulario
  const loadBankCodes = useCallback(async () => {
    try {
      const res = await getBankCodes();
      const list = Array.isArray(res && res.data) ? res.data : [];
      setBankCodes(list);
    } catch (err) {
      setBankCodes([]);
    }
  }, []);

  useEffect(() => {
    if (vista === "nueva") loadBankCodes();
  }, [vista, loadBankCodes]);

  const matchingBens = beneficiaries.filter(function (b) {
    const q = benQuery.toLowerCase();
    return !q || b.full_name.toLowerCase().includes(q) || b.doc_number.includes(q);
  });

  const filtered = dispersiones.filter(function (d) {
    const q = query.toLowerCase();
    const matchQ = !q
      || d.id.toLowerCase().includes(q)
      || (d.ben_name || "").toLowerCase().includes(q)
      || (d.account_key || "").toLowerCase().includes(q)
      || (d.ben_doc_number || "").includes(q);
    const matchS = !filterStatus || d.status === filterStatus;
    return matchQ && matchS;
  });

  const selectedBen: Beneficiary | undefined = beneficiaries.find(function (b) { return b.id === selectedBenId; });
  const selectedCta: BenAccount | undefined = selectedBen
    ? selectedBen.accounts.find(function (c) { return c.id === selectedCtaId; })
    : undefined;

  // ── Confirmar dispersión (Bre-B o ACH según tipo de cuenta) ─────
  const handleConfirmar = async () => {
    if (!selectedBen || !selectedCta || rawMonto < 1000) return;

    setSaving(true);
    try {
      let res: any;
      const reference = "DISP-" + Date.now();
      const concept = "Dispersión a " + selectedBen.full_name;

      if (selectedCta.account_type === "Bre-B") {
        res = await sendPayoutBreb(selectedCta.account_key, rawMonto, concept, reference);
      } else {
        // ACH — necesita bank_code real. Buscamos por nombre en bankCodes.
        const bankMatch = bankCodes.find(function (b) {
          return b.name.toLowerCase() === selectedCta.bank_name.toLowerCase();
        });
        const bankCode = bankMatch ? bankMatch.code : "";

        if (!bankCode) {
          onToast("error", "Banco no reconocido", "No se encontró el código real de " + selectedCta.bank_name + " para hacer la dispersión ACH.");
          setSaving(false);
          return;
        }

        res = await sendPayoutAch({
          bank_code: bankCode,
          account_number: selectedCta.account_key,
          account_type: selectedCta.account_type === "Ahorros" ? "ahorros" : "corriente",
          document_type: selectedBen.doc_type,
          document_number: selectedBen.doc_number,
          holder_name: selectedBen.full_name,
          amount: rawMonto,
          concept,
          reference,
        });
      }

      if (res && res.success === false) {
        const msg = res.error || res.message || "Inténtalo de nuevo";
        onToast("error", "Bepay rechazó la dispersión", typeof msg === "string" ? msg : JSON.stringify(msg));
        return;
      }

      onToast("ok", "Dispersión enviada", fmt(rawMonto) + " -> " + selectedBen.full_name);
      await load();

      setLastTxn({
        id: reference,
        bepay_ide: res && res.data ? res.data.ide : null,
        type: "payout",
        amount: rawMonto,
        concept,
        status: "PENDING",
        ben_name: selectedBen.full_name,
        ben_doc_type: selectedBen.doc_type,
        ben_doc_number: selectedBen.doc_number,
        account_type: selectedCta.account_type,
        bank_name: selectedCta.bank_name,
        account_key: selectedCta.account_key,
        tarifa_aplicada: tarifaFijo,
        comision_total: comision ? comision.total : null,
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
    setBenQuery(""); setSelectedBenId(null); setSelectedCtaId(null);
    setMonto(""); setShowBenList(false);
  };

  const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", fontSize: "13px" };
  const thStyle: React.CSSProperties = { padding: "9px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--t3)", borderBottom: "1px solid var(--border)", textAlign: "left" };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none" };

  function statusLabel(s: string) {
    if (s === "APPROVED" || s === "COMPLETED") return "Completado";
    if (s === "PENDING") return "Pendiente";
    if (s === "DECLINED" || s === "FAILED") return "Rechazado";
    return s;
  }
  function statusColor(s: string) {
    if (s === "APPROVED" || s === "COMPLETED") return "var(--success)";
    if (s === "PENDING") return "var(--warning)";
    return "var(--error)";
  }
  function statusBg(s: string) {
    if (s === "APPROVED" || s === "COMPLETED") return "var(--success-dim)";
    if (s === "PENDING") return "var(--warning-dim)";
    return "var(--error-dim)";
  }

  // ── Vista éxito ───────────────────────────────────────────────
  if (vista === "exito" && lastTxn) {
    return (
      <div style={{ animation: "fadeUp .3s ease", maxWidth: "520px", margin: "0 auto" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "32px", textAlign: "center", boxShadow: "var(--shadow)" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "26px" }}>
            <i className="ti ti-circle-check" />
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px", color: "var(--t1)" }}>Dispersión enviada</div>
          <div style={{ fontSize: "13px", color: "var(--t3)", marginBottom: "24px" }}>{lastTxn.bepay_ide || lastTxn.id}</div>

          <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "16px", textAlign: "left", marginBottom: "20px" }}>
            {[
              ["Beneficiario", lastTxn.ben_name || "—"],
              ["Documento", (lastTxn.ben_doc_type || "") + " · " + (lastTxn.ben_doc_number || "")],
              ["Tipo de cuenta", lastTxn.account_type || "—"],
              ["Banco", lastTxn.bank_name || "—"],
              ["Llave / Número", lastTxn.account_key || "—"],
            ].map(function (row) {
              return (
                <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: "13px" }}>
                  <span style={{ color: "var(--t3)" }}>{row[0]}</span>
                  <span style={{ fontWeight: 500 }}>{row[1]}</span>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", fontSize: "16px", fontWeight: 700 }}>
              <span style={{ color: "var(--t2)" }}>Total debitado</span>
              <span style={{ color: "var(--error)" }}>{fmt(lastTxn.amount + (lastTxn.comision_total || 0))}</span>
            </div>
            {lastTxn.comision_total ? (
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                {fmt(lastTxn.amount)} + comisión {fmt(lastTxn.comision_total)}
              </div>
            ) : null}
          </div>

          <button
            onClick={function () { resetForm(); setVista("historial"); }}
            style={{ width: "100%", padding: "10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
          >
            Ver historial
          </button>
        </div>
      </div>
    );
  }

  // ── Vista nueva dispersión ────────────────────────────────────
  if (vista === "nueva") {
    return (
      <div style={{ animation: "fadeUp .3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
          <button
            onClick={function () { resetForm(); setVista("historial"); }}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "13px", cursor: "pointer" }}
          >
            ← Volver al historial
          </button>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Nueva dispersión</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "1px" }}>Completa los datos y confirma</div>
          </div>
        </div>

        {blocked ? (
          <div style={{ padding: "14px 16px", background: "var(--warning-dim)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--warning)", marginBottom: "16px" }}>
            {blocked}
          </div>
        ) : null}

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--shadow)", opacity: blocked ? 0.5 : 1, pointerEvents: blocked ? "none" : "auto" }}>

          {/* Buscador beneficiario */}
          <div style={{ marginBottom: "16px", position: "relative" }} ref={benRef}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
              Beneficiario <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            {selectedBen ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", background: "var(--success-dim)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--t1)" }}>{selectedBen.full_name}</div>
                  <div style={{ fontSize: "12px", color: "var(--t3)" }}>{selectedBen.doc_type} · {selectedBen.doc_number}</div>
                </div>
                <button
                  onClick={function () { setSelectedBenId(null); setSelectedCtaId(null); setBenQuery(""); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer" }}
                >
                  <i className="ti ti-x" /> Cambiar
                </button>
              </div>
            ) : (
              <React.Fragment>
                <input
                  value={benQuery}
                  onChange={function (e) { setBenQuery(e.target.value); }}
                  onFocus={function () { setShowBenList(true); }}
                  placeholder={bensLoading ? "Cargando beneficiarios..." : "Buscar por nombre o documento..."}
                  style={inputStyle}
                  disabled={bensLoading}
                />
                {showBenList ? (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow)", zIndex: 50, maxHeight: "200px", overflowY: "auto", marginTop: "3px" }}>
                    {matchingBens.length === 0 ? (
                      <div style={{ padding: "12px 14px", fontSize: "12px", color: "var(--t3)" }}>
                        {beneficiaries.length === 0 ? "No tienes beneficiarios. Crea uno en la sección Beneficiarios." : "Sin resultados"}
                      </div>
                    ) : matchingBens.map(function (b) {
                      return (
                        <div
                          key={b.id}
                          onClick={function () { setSelectedBenId(b.id); setSelectedCtaId(null); setShowBenList(false); setBenQuery(""); }}
                          style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: "12px" }}
                          onMouseEnter={function (e) { e.currentTarget.style.background = "var(--elevated)"; }}
                          onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}
                        >
                          <div style={{ fontWeight: 500, color: "var(--t1)" }}>{b.full_name}</div>
                          <div style={{ color: "var(--t3)", marginTop: "2px" }}>{b.doc_type} · {b.doc_number} · {b.accounts.length} cuenta(s)</div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </React.Fragment>
            )}
          </div>

          {/* Selector cuenta */}
          {selectedBen ? (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
                Cuenta destino <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              {selectedBen.accounts.length === 0 ? (
                <div style={{ padding: "10px 14px", background: "var(--warning-dim)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--warning)" }}>
                  Este beneficiario no tiene cuentas registradas. Agrégale una en Beneficiarios.
                </div>
              ) : (
                <select value={selectedCtaId || ""} onChange={function (e) { setSelectedCtaId(e.target.value || null); }} style={inputStyle}>
                  <option value="">Selecciona la cuenta...</option>
                  {selectedBen.accounts.map(function (c) {
                    const label = c.account_type === "Bre-B"
                      ? "Bre-B · " + c.account_key
                      : c.account_type + " · " + c.bank_name + " · " + c.account_key;
                    return <option key={c.id} value={c.id}>{label}</option>;
                  })}
                </select>
              )}

              {selectedCta ? (
                <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    ["Tipo", selectedCta.account_type],
                    ["Banco", selectedCta.bank_name],
                    ["Llave/Número", selectedCta.account_key],
                  ].map(function (row) {
                    return (
                      <div key={row[0]} style={{ padding: "5px 10px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "12px" }}>
                        <span style={{ color: "var(--t3)" }}>{row[0]}:</span>{" "}
                        <span style={{ fontWeight: 500, fontFamily: row[0] === "Llave/Número" ? "var(--mono)" : undefined }}>{row[1]}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {selectedCta && selectedCta.account_type !== "Bre-B" && bankCodes.length > 0 ? (
                (function () {
                  const bankMatch = bankCodes.find(function (b) { return b.name.toLowerCase() === selectedCta.bank_name.toLowerCase(); });
                  if (!bankMatch) {
                    return (
                      <div style={{ marginTop: "8px", padding: "8px 12px", background: "var(--error-dim)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--error)" }}>
                        No se encontró el código real del banco "{selectedCta.bank_name}" en Bepay. La dispersión ACH podría fallar.
                      </div>
                    );
                  }
                  return null;
                })()
              ) : null}
            </div>
          ) : null}

          {/* Monto */}
          {selectedCta ? (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
                Monto <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontWeight: 600 }}>$</span>
                <input
                  value={monto}
                  onChange={function (e) {
                    const clean = e.target.value.replace(/\D/g, "");
                    setMonto(clean ? Number(clean).toLocaleString("es-CO") : "");
                  }}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ ...inputStyle, paddingLeft: "26px" }}
                />
              </div>
            </div>
          ) : null}

          {/* Resumen tarifa */}
          {comision && rawMonto > 0 ? (
            <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: "16px" }}>
              {[
                ["Monto a enviar", fmt(rawMonto)],
                ["Cargo fijo", fmt(comision.fijo)],
                ["Variable", fmt(comision.variable)],
                ["Total comisión", fmt(comision.total)],
              ].map(function (row) {
                return (
                  <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--t3)" }}>{row[0]}</span>
                    <span style={{ fontWeight: 500, color: "var(--t1)" }}>{row[1]}</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: "15px", fontWeight: 700 }}>
                <span style={{ color: "var(--t2)" }}>Total a débitar</span>
                <span style={{ color: "var(--error)" }}>{fmt(rawMonto + comision.total)}</span>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              onClick={function () { resetForm(); setVista("historial"); }}
              style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={!selectedBen || !selectedCta || rawMonto < 1000 || saving}
              style={{
                padding: "9px 16px",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontWeight: 600,
                cursor: (!selectedBen || !selectedCta || rawMonto < 1000 || saving) ? "not-allowed" : "pointer",
                opacity: (!selectedBen || !selectedCta || rawMonto < 1000 || saving) ? 0.5 : 1,
              }}
            >
              {saving ? "Enviando..." : "Confirmar dispersión"}
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
        <button
          onClick={function () { resetForm(); setVista("nueva"); refetchBens(); }}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
        >
          <i className="ti ti-send" />Dispersar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "9px", marginBottom: "14px" }}>
        <div style={{ position: "relative", flex: 2 }}>
          <i className="ti ti-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: "14px" }} />
          <input value={query} onChange={function (e) { setQuery(e.target.value); }} placeholder="Buscar por ID, beneficiario o cuenta..." style={{ ...inputStyle, paddingLeft: "30px" }} />
        </div>
        <select value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value); }} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontSize: "13px" }}>
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
            <i className="ti ti-send" style={{ fontSize: "28px", display: "block", marginBottom: "10px", opacity: 0.3 }} />
            {dispersiones.length === 0 ? "Aún no hay dispersiones. Haz clic en Dispersar para comenzar." : "Sin resultados para los filtros aplicados."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Fecha", "Estado", "Beneficiario", "Cuenta", "Banco", "Monto", "Comisión", ""].map(function (h) {
                    return <th key={h} style={{ ...thStyle, textAlign: (h === "Monto" || h === "Comisión") ? "right" : "left" }}>{h}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.map(function (d) {
                  return (
                    <tr key={d.id}
                      onMouseEnter={function (e) { e.currentTarget.style.background = "var(--elevated)"; }}
                      onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontSize: "12px", color: "var(--t1)" }}>
                          {new Date(d.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--t3)" }}>
                          {new Date(d.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 500, color: statusColor(d.status), background: statusBg(d.status) }}>
                          {statusLabel(d.status)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 500, color: "var(--t1)" }}>{d.ben_name || "—"}</td>
                      <td style={tdStyle}>{d.account_type || "—"}</td>
                      <td style={{ ...tdStyle, fontSize: "12px", color: "var(--t2)" }}>{d.bank_name || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "var(--error)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.amount)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>
                        {d.comision_total ? fmt(d.comision_total) : "—"}
                      </td>
                      <td style={tdStyle}>
                        {(d.status === "APPROVED" || d.status === "COMPLETED") ? (
                          <button onClick={function () { onToast("info", "Comprobante", "PDF para " + (d.bepay_ide || d.id)); }}
                            style={{ background: "none", border: "1px solid var(--border)", borderRadius: "7px", padding: "4px 7px", cursor: "pointer", color: "var(--accent)", fontSize: "13px" }}>
                            <i className="ti ti-file-download" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};