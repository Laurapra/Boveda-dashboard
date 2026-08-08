// src/pages/Cuentas.tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { getBanks } from "../lib/bepayClient";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import type { ToastType } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

type AccountKind = "Bre-B" | "Ahorros" | "Corriente";

// ── Tipos beneficiarios ─────────────────────────────────────────────
interface BenCuenta {
  id: string;
  beneficiary_id: string;
  account_type: AccountKind;
  bank_name: string;
  account_key: string;
  is_active: boolean;
}

interface Ben {
  id: string;
  user_id: string;
  full_name: string;
  doc_type: string;
  doc_number: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  accounts: BenCuenta[];
}

// Forma cruda que devuelve Supabase antes de mapearla a `Ben`
interface RawBenRow {
  id: string;
  user_id: string;
  full_name: string;
  doc_type: string;
  doc_number: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  beneficiary_accounts: BenCuenta[] | null;
}

// Lista de respaldo mientras carga el catálogo real de bancos de Bepay, o
// si la llamada falla — así el formulario nunca se queda sin opciones.
const BANCOS_FALLBACK = ["Bancolombia", "Davivienda", "Banco de Bogotá", "BBVA Colombia", "Scotiabank Colpatria", "Banco Popular", "Nequi", "Daviplata", "Otro"];

// ── Helpers puros, fuera del componente ──────────────────────────────
function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

function mapBenRow(row: RawBenRow): Ben {
  return {
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name,
    doc_type: row.doc_type,
    doc_number: row.doc_number,
    phone: row.phone,
    email: row.email,
    created_at: row.created_at,
    accounts: row.beneficiary_accounts ?? [],
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg)",
  color: "var(--t1)",
  fontSize: "13px",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--t3)",
  marginBottom: "5px",
};

export const CuentasView: React.FC<Props> = ({ onToast }) => {
  const { user } = useAuthStore();

  // ── Catálogo real de bancos (Bepay) para las cuentas Ahorro/Corriente ──
  const [bancos, setBancos] = useState<string[]>([]);
  const [bancosLoading, setBancosLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const res = await getBanks(200);
        if (cancelled) return;
        const list = Array.isArray(res?.data)
          ? (res.data as Array<Record<string, unknown>>)
              .map((b) => String(b.name ?? b.nombre ?? b.bank_name ?? "").trim())
              .filter(Boolean)
          : [];
        setBancos(list);
      } catch {
        if (!cancelled) setBancos([]);
      } finally {
        if (!cancelled) setBancosLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);
  const bancoOptions = bancos.length > 0 ? bancos : BANCOS_FALLBACK;

  // ══════════════════════════════════════════════════════════════
  // BENEFICIARIOS — personas a quienes se les envía dinero
  // ══════════════════════════════════════════════════════════════
  const [bens, setBens] = useState<Ben[]>([]);
  const [bensLoading, setBensLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const [newBenOpen, setNewBenOpen] = useState(false);
  const [newCtaTarget, setNewCtaTarget] = useState<string | null>(null);
  const [savingBen, setSavingBen] = useState(false);
  const [savingCta, setSavingCta] = useState(false);

  const [bForm, setBForm] = useState({
    tipodoc: "CC",
    numdoc: "",
    nombre: "",
    celular: "",
    correo: "",
  });

  // El tipo/banco/número/llave de la PRIMERA cuenta se piden junto con el
  // beneficiario — antes esto quedaba fijo en Bre-B/Ramplix sin importar lo
  // que el usuario necesitara. Se reutiliza para el modal de "agregar otra
  // cuenta" a un beneficiario ya existente.
  const [ctaForm, setCtaForm] = useState<{
    tipo: AccountKind | "";
    banco: string;
    num: string;
    llave: string;
  }>({ tipo: "", banco: "", num: "", llave: "" });

  const bf = (k: keyof typeof bForm) => (v: string) => setBForm((p) => ({ ...p, [k]: v }));
  const cf = (k: keyof typeof ctaForm) => (v: string) => setCtaForm((p) => ({ ...p, [k]: v }));

  // ── Cargar beneficiarios reales de Supabase ─────────────────────
  const loadBens = useCallback(async () => {
    if (!user) return;
    setBensLoading(true);
    try {
      const { data, error } = await supabase
        .from("beneficiaries")
        .select(
          "id, user_id, full_name, doc_type, doc_number, phone, email, created_at, beneficiary_accounts ( id, beneficiary_id, account_type, bank_name, account_key, is_active )"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as RawBenRow[];
      const mapped = rows.map(mapBenRow);

      setBens(mapped);
      if (mapped.length > 0) setOpenIds(new Set([mapped[0].id]));
    } catch (err: unknown) {
      onToast("error", "Error cargando beneficiarios", getErrorMessage(err));
    } finally {
      setBensLoading(false);
    }
  }, [user, onToast]);

  // Carga inicial — el setState real ocurre dentro del microtask,
  // no de forma sincrona en el cuerpo del efecto.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadBens();
    });
    return () => {
      cancelled = true;
    };
  }, [loadBens]);

  // Suscripción realtime — efecto independiente del anterior
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("bens-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "beneficiaries", filter: "user_id=eq." + user.id }, () => loadBens())
      .on("postgres_changes", { event: "*", schema: "public", table: "beneficiary_accounts" }, () => loadBens())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadBens]);

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveBen = async () => {
    const cuentaValida =
      ctaForm.tipo === "Bre-B" ? !!ctaForm.llave.trim() :
      ctaForm.tipo === "Ahorros" || ctaForm.tipo === "Corriente" ? !!ctaForm.banco && !!ctaForm.num.trim() :
      false;
    if (!bForm.tipodoc || !bForm.numdoc || !bForm.nombre || !ctaForm.tipo || !cuentaValida) {
      onToast("error", "Campos requeridos", "Completa todos los campos obligatorios, incluyendo el tipo de cuenta");
      return;
    }
    if (!user) return;

    setSavingBen(true);
    try {
      const { data: benData, error: benErr } = await supabase
        .from("beneficiaries")
        .insert({
          user_id: user.id,
          full_name: bForm.nombre,
          doc_type: bForm.tipodoc,
          doc_number: bForm.numdoc,
          phone: bForm.celular || null,
          email: bForm.correo || null,
        })
        .select()
        .single();

      if (benErr) throw new Error(benErr.message);

      const { error: ctaErr } = await supabase.from("beneficiary_accounts").insert({
        beneficiary_id: benData.id,
        account_type: ctaForm.tipo,
        bank_name: ctaForm.tipo === "Bre-B" ? "Ramplix" : ctaForm.banco,
        account_key: ctaForm.tipo === "Bre-B" ? ctaForm.llave : ctaForm.num,
        is_active: true,
      });

      if (ctaErr) throw new Error(ctaErr.message);

      onToast("ok", "Beneficiario guardado", bForm.nombre);
      setBForm({ tipodoc: "CC", numdoc: "", nombre: "", celular: "", correo: "" });
      setCtaForm({ tipo: "", banco: "", num: "", llave: "" });
      setNewBenOpen(false);
      await loadBens();
    } catch (err: unknown) {
      onToast("error", "Error guardando", getErrorMessage(err));
    } finally {
      setSavingBen(false);
    }
  };

  const handleSaveCta = async () => {
    if (newCtaTarget === null || !ctaForm.tipo) return;

    setSavingCta(true);
    try {
      const { error } = await supabase.from("beneficiary_accounts").insert({
        beneficiary_id: newCtaTarget,
        account_type: ctaForm.tipo,
        bank_name: ctaForm.tipo === "Bre-B" ? "Ramplix" : ctaForm.banco,
        account_key: ctaForm.tipo === "Bre-B" ? ctaForm.llave : ctaForm.num,
        is_active: true,
      });

      if (error) throw new Error(error.message);

      onToast("ok", "Cuenta agregada", ctaForm.tipo);
      setCtaForm({ tipo: "", banco: "", num: "", llave: "" });
      setNewCtaTarget(null);
      await loadBens();
    } catch (err: unknown) {
      onToast("error", "Error guardando cuenta", getErrorMessage(err));
    } finally {
      setSavingCta(false);
    }
  };

  const handleDeleteBen = async (id: string, nombre: string) => {
    if (!confirm("¿Eliminar a " + nombre + "? Se eliminarán también sus cuentas.")) return;
    const { error } = await supabase.from("beneficiaries").delete().eq("id", id);
    if (error) {
      onToast("error", "Error", error.message);
      return;
    }
    onToast("ok", "Eliminado", nombre);
    await loadBens();
  };

  const handleDeleteCta = async (ctaId: string, banco: string) => {
    if (!confirm("¿Eliminar la cuenta de " + banco + "?")) return;
    const { error } = await supabase.from("beneficiary_accounts").delete().eq("id", ctaId);
    if (error) {
      onToast("error", "Error", error.message);
      return;
    }
    onToast("ok", "Cuenta eliminada", banco);
    await loadBens();
  };

  const filteredBens = bens.filter((b) => {
    const q = query.toLowerCase();
    return (
      !q ||
      b.full_name.toLowerCase().includes(q) ||
      b.doc_number.includes(q) ||
      b.accounts.some((c) => c.bank_name.toLowerCase().includes(q) || c.account_key.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: "18px" }}>
        <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", color: "var(--t1)" }}>Beneficiarios</h1>
        <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>Gestiona los beneficiarios de tus dispersiones</p>
      </div>

      <React.Fragment>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
            {[
              { label: "Total Beneficiarios", value: bens.length, icon: "ti-users", color: "var(--accent)" },
              { label: "Total Cuentas", value: bens.reduce((s, b) => s + b.accounts.length, 0), icon: "ti-credit-card", color: "var(--success)" },
            ].map((s) => (
              <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px", boxShadow: "var(--shadow)" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--elevated)", display: "grid", placeItems: "center", color: s.color, flexShrink: 0 }}>
                  <i className={"ti " + s.icon} style={{ fontSize: "18px" }} />
                </div>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--t1)" }}>{s.value}</div>
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "3px" }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Barra búsqueda */}
          <div style={{ display: "flex", gap: "9px", marginBottom: "14px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <i className="ti ti-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: "14px" }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, documento o banco..." style={{ ...inputStyle, paddingLeft: "30px" }} />
            </div>
            <button onClick={() => setQuery("")} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer", fontSize: "13px" }}>
              Limpiar
            </button>
            <button onClick={loadBens} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer" }}>
              <i className="ti ti-refresh" />
            </button>
            <button
              onClick={() => {
                setCtaForm({ tipo: "", banco: "", num: "", llave: "" });
                setNewBenOpen(true);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              <i className="ti ti-plus" />
              Nuevo Beneficiario
            </button>
          </div>

          <div style={{ marginBottom: "12px", fontSize: "12px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Lista de Beneficiarios</div>

          {/* Lista */}
          {bensLoading ? (
            <div style={{ textAlign: "center", padding: "48px", color: "var(--t3)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
            </div>
          ) : filteredBens.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px", color: "var(--t3)" }}>
              <i className="ti ti-users" style={{ fontSize: "32px", display: "block", marginBottom: "12px", opacity: 0.3 }} />
              <div style={{ fontWeight: 600, color: "var(--t2)", marginBottom: "6px" }}>{bens.length === 0 ? "Aún no tienes beneficiarios" : "Sin resultados"}</div>
              <div style={{ fontSize: "12px" }}>{bens.length === 0 ? "Agrega tu primer beneficiario con el botón + Nuevo Beneficiario" : "Ajusta los filtros de búsqueda"}</div>
            </div>
          ) : (
            filteredBens.map((b) => {
              const isOpen = openIds.has(b.id);
              return (
                <div key={b.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: "10px", overflow: "hidden", background: "var(--surface)" }}>
                  <div
                    onClick={() => toggleOpen(b.id)}
                    style={{ display: "flex", alignItems: "center", padding: "12px 16px", cursor: "pointer", gap: "12px" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
                      {iniciales(b.full_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--t1)" }}>{b.full_name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
                        <span style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "3px", padding: "1px 5px", fontSize: "9px", color: "var(--t3)" }}>{b.doc_type}</span>
                        <span style={{ fontSize: "10px", color: "var(--t3)" }}>{b.doc_number}</span>
                        {b.phone ? (
                          <React.Fragment>
                            <span style={{ fontSize: "10px", color: "var(--t3)" }}>·</span>
                            <span style={{ fontSize: "10px", color: "var(--t3)" }}>+57 {b.phone}</span>
                          </React.Fragment>
                        ) : null}
                        {b.email ? (
                          <React.Fragment>
                            <span style={{ fontSize: "10px", color: "var(--t3)" }}>·</span>
                            <span style={{ fontSize: "10px", color: "var(--t3)" }}>{b.email}</span>
                          </React.Fragment>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                      <span style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "11px", color: "var(--t2)", padding: "2px 9px" }}>
                        {b.accounts.length} cuenta{b.accounts.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBen(b.id, b.full_name);
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "16px", padding: "2px" }}
                      >
                        <i className="ti ti-trash" />
                      </button>
                      <i className={"ti " + (isOpen ? "ti-chevron-up" : "ti-chevron-down")} style={{ color: "var(--t3)", fontSize: "14px" }} />
                    </div>
                  </div>

                  {isOpen ? (
                    <div style={{ borderTop: "1px solid var(--border)" }}>
                      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "10px" }}>Datos del Titular</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                          {[
                            { label: "Nombre completo", value: b.full_name, mono: false },
                            { label: "Tipo documento", value: b.doc_type, mono: false },
                            { label: "Número documento", value: b.doc_number, mono: true },
                            { label: "Celular", value: b.phone ? "+57 " + b.phone : "—", mono: false },
                            { label: "Correo", value: b.email || "—", mono: false },
                            { label: "Registrado", value: formatDate(b.created_at), mono: false },
                          ].map((row) => (
                            <div key={row.label} style={{ background: "var(--elevated)", borderRadius: "var(--radius-sm)", padding: "8px 11px" }}>
                              <div style={{ fontSize: "9px", color: "var(--t3)", marginBottom: "2px" }}>{row.label}</div>
                              <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--t1)", fontFamily: row.mono ? "var(--mono)" : undefined }}>{row.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--t2)" }}>Cuentas bancarias</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewCtaTarget(b.id);
                              setCtaForm({ tipo: "", banco: "", num: "", llave: "" });
                            }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer" }}
                          >
                            <i className="ti ti-plus" /> Agregar cuenta
                          </button>
                        </div>

                        {b.accounts.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "var(--t3)", fontSize: "12px" }}>Sin cuentas registradas</div>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead>
                              <tr>
                                {["Banco", "Tipo", "Número / Llave", "Estado", ""].map((h) => (
                                  <th key={h} style={{ padding: "7px 10px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", color: "var(--t3)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {b.accounts.map((c) => (
                                <tr key={c.id}>
                                  <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)", color: "var(--t1)" }}>{c.bank_name}</td>
                                  <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)" }}>
                                    <StatusBadge value={c.account_type} />
                                  </td>
                                  <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)", fontFamily: "var(--mono)", fontSize: "11px", color: "var(--t2)" }}>{c.account_key}</td>
                                  <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)" }}>
                                    <StatusBadge value={c.is_active ? "Activa" : "Inactiva"} />
                                  </td>
                                  <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--border)" }}>
                                    <button onClick={() => handleDeleteCta(c.id, c.bank_name)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "14px" }}>
                                      <i className="ti ti-trash" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}

          {/* Modal nuevo beneficiario */}
          <Modal
            isOpen={newBenOpen}
            onClose={() => setNewBenOpen(false)}
            title="Nuevo Beneficiario"
            subtitle="Completa los datos del titular y su cuenta bancaria"
            footer={
              <React.Fragment>
                <button onClick={() => setNewBenOpen(false)} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={handleSaveBen} disabled={savingBen} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer", opacity: savingBen ? 0.6 : 1 }}>
                  <i className="ti ti-check" style={{ marginRight: "6px" }} />
                  {savingBen ? "Guardando…" : "Guardar beneficiario"}
                </button>
              </React.Fragment>
            }
          >
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "10px", paddingBottom: "7px", borderBottom: "1px solid var(--border)" }}>
              Detalle del Titular
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={labelStyle}>
                  Tipo de Documento <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <select value={bForm.tipodoc} onChange={(e) => bf("tipodoc")(e.target.value)} style={inputStyle}>
                  <option value="CC">Cédula (CC)</option>
                  <option value="CE">Cédula extranjería (CE)</option>
                  <option value="PA">Pasaporte</option>
                  <option value="NIT">NIT</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>
                  Número de Documento <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input value={bForm.numdoc} onChange={(e) => bf("numdoc")(e.target.value)} placeholder="Ej. 1023456789" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label style={labelStyle}>
                Nombre del Titular <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <input value={bForm.nombre} onChange={(e) => bf("nombre")(e.target.value)} placeholder="Nombre completo del titular" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={labelStyle}>Celular (opcional)</label>
                <input value={bForm.celular} onChange={(e) => bf("celular")(e.target.value)} placeholder="300 000 0000" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Correo (opcional)</label>
                <input value={bForm.correo} onChange={(e) => bf("correo")(e.target.value)} placeholder="correo@ejemplo.com" style={inputStyle} />
              </div>
            </div>
            <div style={{ height: "1px", background: "var(--border)", margin: "14px 0" }} />
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "10px", paddingBottom: "7px", borderBottom: "1px solid var(--border)" }}>Cuenta de dispersión</div>
            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>
                Tipo de Cuenta <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                {(
                  [
                    { tipo: "Ahorros" as const, icon: "ti-piggy-bank" },
                    { tipo: "Corriente" as const, icon: "ti-building-bank" },
                    { tipo: "Bre-B" as const, icon: "ti-key" },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.tipo}
                    onClick={() => cf("tipo")(opt.tipo)}
                    style={{
                      border: "1.5px solid " + (ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--border)"),
                      background: ctaForm.tipo === opt.tipo ? "var(--accent-dim)" : "transparent",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 8px",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    <i className={"ti " + opt.icon} style={{ fontSize: "17px", color: ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--t3)", display: "block", marginBottom: "4px" }} />
                    <div style={{ fontSize: "11px", fontWeight: 500, color: ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--t3)" }}>{opt.tipo}</div>
                  </button>
                ))}
              </div>
            </div>
            {ctaForm.tipo === "Ahorros" || ctaForm.tipo === "Corriente" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>
                    Banco <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <select value={ctaForm.banco} onChange={(e) => cf("banco")(e.target.value)} style={inputStyle} disabled={bancosLoading}>
                    <option value="">{bancosLoading ? "Cargando bancos..." : "Selecciona..."}</option>
                    {bancoOptions.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>
                    Número <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <input value={ctaForm.num} onChange={(e) => cf("num")(e.target.value)} placeholder="Ej. 4830-0005-5400" style={inputStyle} />
                </div>
              </div>
            ) : null}
            {ctaForm.tipo === "Bre-B" ? (
              <div>
                <label style={labelStyle}>
                  Llave Bre-B <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input value={ctaForm.llave} onChange={(e) => cf("llave")(e.target.value)} placeholder="Ej. nombre@breb.co" style={inputStyle} />
              </div>
            ) : null}
          </Modal>

          {/* Modal agregar cuenta */}
          <Modal
            isOpen={newCtaTarget !== null}
            onClose={() => setNewCtaTarget(null)}
            title="Agregar cuenta bancaria"
            subtitle={newCtaTarget ? bens.find((b) => b.id === newCtaTarget)?.full_name : ""}
            footer={
              <React.Fragment>
                <button onClick={() => setNewCtaTarget(null)} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={handleSaveCta} disabled={!ctaForm.tipo || savingCta} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: !ctaForm.tipo ? "not-allowed" : "pointer", opacity: !ctaForm.tipo || savingCta ? 0.5 : 1 }}>
                  <i className="ti ti-plus" style={{ marginRight: "6px" }} />
                  {savingCta ? "Guardando…" : "Agregar cuenta"}
                </button>
              </React.Fragment>
            }
          >
            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>
                Tipo de Cuenta <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                {(
                  [
                    { tipo: "Ahorros" as const, icon: "ti-piggy-bank" },
                    { tipo: "Corriente" as const, icon: "ti-building-bank" },
                    { tipo: "Bre-B" as const, icon: "ti-key" },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.tipo}
                    onClick={() => cf("tipo")(opt.tipo)}
                    style={{
                      border: "1.5px solid " + (ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--border)"),
                      background: ctaForm.tipo === opt.tipo ? "var(--accent-dim)" : "transparent",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 8px",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    <i className={"ti " + opt.icon} style={{ fontSize: "17px", color: ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--t3)", display: "block", marginBottom: "4px" }} />
                    <div style={{ fontSize: "11px", fontWeight: 500, color: ctaForm.tipo === opt.tipo ? "var(--accent)" : "var(--t3)" }}>{opt.tipo}</div>
                  </button>
                ))}
              </div>
            </div>
            {ctaForm.tipo === "Ahorros" || ctaForm.tipo === "Corriente" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>
                    Banco <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <select value={ctaForm.banco} onChange={(e) => cf("banco")(e.target.value)} style={inputStyle} disabled={bancosLoading}>
                    <option value="">{bancosLoading ? "Cargando bancos..." : "Selecciona..."}</option>
                    {bancoOptions.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>
                    Número <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <input value={ctaForm.num} onChange={(e) => cf("num")(e.target.value)} placeholder="Ej. 4830-0005-5400" style={inputStyle} />
                </div>
              </div>
            ) : null}
            {ctaForm.tipo === "Bre-B" ? (
              <div>
                <label style={labelStyle}>
                  Llave Bre-B <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input value={ctaForm.llave} onChange={(e) => cf("llave")(e.target.value)} placeholder="Ej. nombre@breb.co" style={inputStyle} />
              </div>
            ) : null}
          </Modal>
      </React.Fragment>
    </div>
  );
};