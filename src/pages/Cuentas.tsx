// src/pages/Cuentas.tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useBankAccounts } from "../hooks/useBankAccounts";
import { AddBankAccountModal } from "../components/AddBankAccountModal";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import type { ToastType } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

type Tab = "mias" | "beneficiarios";
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

const BANCOS = ["Bancolombia", "Davivienda", "Banco de Bogotá", "BBVA Colombia", "Scotiabank Colpatria", "Banco Popular", "Nequi", "Daviplata", "Otro"];

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
  const [tab, setTab] = useState<Tab>("mias");

  // ══════════════════════════════════════════════════════════════
  // MIS CUENTAS — cuentas bancarias propias del usuario
  // ══════════════════════════════════════════════════════════════
  const { accounts, loading: accLoading, setDefault, deleteAccount } = useBankAccounts();
  const [modalOpen, setModalOpen] = useState(false);

  const handleSetDefault = async (id: string) => {
    const err = await setDefault(id);
    if (err) onToast("error", "Error", err);
    else onToast("ok", "Actualizado", "Cuenta marcada como predeterminada");
  };

  const handleDeleteAcc = async (id: string) => {
    if (!confirm("¿Eliminar esta cuenta bancaria?")) return;
    const err = await deleteAccount(id);
    if (err) onToast("error", "Error", err);
    else onToast("ok", "Eliminada", "Cuenta bancaria eliminada");
  };

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
    llave: "",
  });

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
    if (!bForm.tipodoc || !bForm.numdoc || !bForm.nombre || !bForm.llave) {
      onToast("error", "Campos requeridos", "Completa todos los campos obligatorios");
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
        account_type: "Bre-B",
        bank_name: "Ramplix",
        account_key: bForm.llave,
        is_active: true,
      });

      if (ctaErr) throw new Error(ctaErr.message);

      onToast("ok", "Beneficiario guardado", bForm.nombre);
      setBForm({ tipodoc: "CC", numdoc: "", nombre: "", celular: "", correo: "", llave: "" });
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

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 18px",
    fontSize: "13.5px",
    fontWeight: 600,
    border: "none",
    background: "none",
    cursor: "pointer",
    color: active ? "var(--accent)" : "var(--t3)",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    display: "flex",
    alignItems: "center",
    gap: "7px",
  });

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: "18px" }}>
        <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", color: "var(--t1)" }}>Cuentas</h1>
        <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>Gestiona tus cuentas bancarias y beneficiarios de dispersión</p>
      </div>

      {/* Pestañas */}
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid var(--border)", marginBottom: "20px" }}>
        <button onClick={() => setTab("mias")} style={tabButtonStyle(tab === "mias")}>
          <i className="ti ti-building-bank" style={{ fontSize: "16px" }} />
          Mis Cuentas
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              background: tab === "mias" ? "var(--accent-dim)" : "var(--elevated)",
              color: tab === "mias" ? "var(--accent)" : "var(--t3)",
              borderRadius: "20px",
              padding: "1px 8px",
            }}
          >
            {accounts.length}
          </span>
        </button>
        <button onClick={() => setTab("beneficiarios")} style={tabButtonStyle(tab === "beneficiarios")}>
          <i className="ti ti-users" style={{ fontSize: "16px" }} />
          Beneficiarios
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              background: tab === "beneficiarios" ? "var(--accent-dim)" : "var(--elevated)",
              color: tab === "beneficiarios" ? "var(--accent)" : "var(--t3)",
              borderRadius: "20px",
              padding: "1px 8px",
            }}
          >
            {bens.length}
          </span>
        </button>
      </div>

      {/* ══════════════════ TAB: MIS CUENTAS ══════════════════ */}
      {tab === "mias" ? (
        <React.Fragment>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <p style={{ color: "var(--t3)", fontSize: "12.5px" }}>Cuentas propias verificadas para recibir tus dispersiones</p>
            <button
              onClick={() => setModalOpen(true)}
              style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              + Agregar cuenta
            </button>
          </div>

          {accLoading ? (
            <div style={{ textAlign: "center", padding: "60px", color: "var(--t3)" }}>Cargando…</div>
          ) : accounts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
              <div style={{ width: "54px", height: "54px", borderRadius: "14px", background: "var(--elevated)", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "var(--t2)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="24" height="24">
                  <rect x="3" y="6" width="18" height="13" rx="2" />
                  <path d="M3 10h18M7 15h3" strokeLinecap="round" />
                </svg>
              </div>
              <h4 style={{ fontSize: "15px", color: "var(--t1)", marginBottom: "6px" }}>Sin cuentas registradas</h4>
              <p style={{ color: "var(--t3)", fontSize: "13px" }}>Agrega una cuenta bancaria para empezar a dispersar fondos.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  style={{
                    background: "var(--surface)",
                    border: acc.is_default ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "18px",
                    boxShadow: "var(--shadow)",
                    position: "relative",
                  }}
                >
                  {acc.is_default ? (
                    <span
                      style={{
                        position: "absolute",
                        top: "14px",
                        right: "14px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "var(--accent-dim)",
                        color: "var(--accent)",
                      }}
                    >
                      PREDETERMINADA
                    </span>
                  ) : null}

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--elevated)", display: "grid", placeItems: "center", color: "var(--accent)", flexShrink: 0 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                        <rect x="3" y="6" width="18" height="13" rx="2" />
                        <path d="M3 10h18M7 15h3" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--t1)" }}>{acc.bank_name}</div>
                      <div style={{ fontSize: "12.5px", color: "var(--t3)" }}>
                        {acc.account_type === "ahorros" ? "Ahorros" : "Corriente"} · ****{acc.account_number.slice(-4)}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "6px" }}>{acc.account_holder_name}</div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                    {acc.is_verified ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", fontWeight: 600, color: "var(--success)", background: "var(--success-dim)", padding: "3px 9px", borderRadius: "7px" }}>
                        ✓ Verificada
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", fontWeight: 600, color: "var(--warning)", background: "var(--warning-dim)", padding: "3px 9px", borderRadius: "7px" }}>
                        En verificación
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    {!acc.is_default ? (
                      <button
                        onClick={() => handleSetDefault(acc.id)}
                        style={{ flex: 1, padding: "7px", fontSize: "12.5px", fontWeight: 600, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer" }}
                      >
                        Hacer predeterminada
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleDeleteAcc(acc.id)}
                      style={{ padding: "7px 12px", fontSize: "12.5px", fontWeight: 600, border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", background: "var(--error-dim)", color: "var(--error)", cursor: "pointer" }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <AddBankAccountModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onToast={onToast} />
        </React.Fragment>
      ) : null}

      {/* ══════════════════ TAB: BENEFICIARIOS ══════════════════ */}
      {tab === "beneficiarios" ? (
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
              onClick={() => setNewBenOpen(true)}
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
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: "10px", paddingBottom: "7px", borderBottom: "1px solid var(--border)" }}>Llave Bre-B</div>
            <div>
              <label style={labelStyle}>
                Llave Bre-B <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <input value={bForm.llave} onChange={(e) => bf("llave")(e.target.value)} placeholder="Ej. nombre@breb.co" style={inputStyle} />
              <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>Ingresa la llave — consultaremos el banco automáticamente</div>
            </div>
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
                  <select value={ctaForm.banco} onChange={(e) => cf("banco")(e.target.value)} style={inputStyle}>
                    <option value="">Selecciona...</option>
                    {BANCOS.map((b) => (
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
      ) : null}
    </div>
  );
};