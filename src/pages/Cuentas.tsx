// src/pages/Cuentas.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { getBanks, getDocumentTypes, lookupBrebKey, syncMyPayouts } from "../lib/bepayClient";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import type { ToastType } from "../types";
import "./Cuentas.css";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

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

// Tipo de documento del beneficiario — este valor se manda TAL CUAL a Bepay
// como "identification_type" al hacer una dispersión ACH (ver Movimientos.tsx,
// document_type: selectedBen.doc_type), así que tiene que ser exactamente uno
// de los códigos que Bepay reconoce, no un valor inventado. Antes esta lista
// estaba a mano con "PA" para pasaporte — confirmado contra el catálogo real
// de Bepay (GET /documentTypes) que el código correcto es "PAS", así que "PA"
// nunca habría funcionado en una dispersión real a alguien con pasaporte.
// Respaldo mientras carga el catálogo real, con el mismo código PEP agregado
// manualmente porque Bepay no lo trae en su catálogo (Permiso Especial de
// Permanencia, documento válido en Colombia para migrantes venezolanos).
const DOC_TYPES_FALLBACK = [
  { value: "CC",  label: "Cédula de ciudadanía (CC)" },
  { value: "CE",  label: "Cédula de extranjería (CE)" },
  { value: "PAS", label: "Pasaporte (PAS)" },
  { value: "NIT", label: "NIT" },
  { value: "TI",  label: "Tarjeta de identidad (TI)" },
  { value: "RC",  label: "Registro civil de nacimiento (RC)" },
  { value: "PEP", label: "Permiso Especial de Permanencia (PEP)" },
];

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

  // ── Catálogo real de tipos de documento (Bepay) + PEP agregado a mano ──
  const [docTypes, setDocTypes] = useState<{ value: string; label: string }[]>([]);
  const [docTypesLoading, setDocTypesLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const res = await getDocumentTypes();
        if (cancelled) return;
        const raw = Array.isArray(res?.data) ? (res.data as Array<Record<string, unknown>>) : [];
        const fromBepay = raw
          .map((d) => {
            const value = String(d.short_name ?? d.code ?? "").trim();
            const name = String(d.name ?? d.nombre ?? value).trim();
            return value ? { value, label: `${name} (${value})` } : null;
          })
          .filter((x): x is { value: string; label: string } => x !== null);
        // Si Bepay no devolvió nada usable (llamada fallida, catálogo vacío,
        // etc.) se deja docTypes vacío para que docTypeOptions caiga al
        // respaldo completo (DOC_TYPES_FALLBACK, que ya incluye PEP) — antes
        // esto agregaba PEP encima de una lista vacía, y como el resultado
        // ya no estaba vacío ("[PEP]".length > 0) nunca caía al respaldo,
        // así que solo se veía PEP y nada más de Bepay.
        if (fromBepay.length === 0) {
          setDocTypes([]);
        } else {
          // PEP no viene en el catálogo de Bepay — se agrega igual porque es
          // un documento de identidad válido en Colombia (migrantes
          // venezolanos). Se evita duplicarlo por si algún día Bepay lo
          // llega a incluir.
          const hasPep = fromBepay.some((d) => d.value.toUpperCase() === "PEP");
          setDocTypes(hasPep ? fromBepay : [...fromBepay, { value: "PEP", label: "Permiso Especial de Permanencia (PEP)" }]);
        }
      } catch {
        if (!cancelled) setDocTypes([]);
      } finally {
        if (!cancelled) setDocTypesLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);
  const docTypeOptions = docTypes.length > 0 ? docTypes : DOC_TYPES_FALLBACK;

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
    confirmDoc: string;
  }>({ tipo: "", banco: "", num: "", llave: "", confirmDoc: "" });

  const bf = (k: keyof typeof bForm) => (v: string) => setBForm((p) => ({ ...p, [k]: v }));
  const cf = (k: keyof typeof ctaForm) => (v: string) => setCtaForm((p) => ({ ...p, [k]: v }));

  // ── Verificación real de la llave Bre-B (banco/titular) ──────────────
  // Antes el banco de una cuenta Bre-B se guardaba SIEMPRE como "Ramplix" a
  // mano, sin importar a qué banco esté realmente vinculada la llave (Nequi,
  // Bancolombia, Movii, etc.) — mismo endpoint que ya usa Movimientos.tsx
  // para verificar el titular antes de enviar plata (GET /payout/get/{key}
  // vía lookup_key). Acá no bloquea el guardado si Bepay no puede
  // verificarla todavía (solo avisa) — a diferencia de enviar plata, acá
  // solo estamos registrando el dato del beneficiario para usarlo después.
  const [ctaKeyLookup, setCtaKeyLookup] = useState<{ bank: string | null; holderName: string | null; verified: boolean } | null>(null);
  const [ctaKeyLookupLoading, setCtaKeyLookupLoading] = useState(false);
  useEffect(() => {
    if (ctaForm.tipo !== "Bre-B" || !ctaForm.llave.trim()) {
      setCtaKeyLookup(null);
      setCtaKeyLookupLoading(false);
      return;
    }
    let cancelled = false;
    setCtaKeyLookupLoading(true);
    // Debounce de 600ms — sin esto se dispara una consulta a Bepay por cada
    // tecla mientras la persona todavía está escribiendo la llave.
    const timer = setTimeout(() => {
      Promise.resolve().then(async () => {
        if (cancelled) return;
        try {
          const res = await lookupBrebKey(ctaForm.llave.trim());
          if (cancelled) return;
          if (res && res.success && res.data) {
            setCtaKeyLookup({
              verified: true,
              holderName: res.data.name || res.data.holder_name || null,
              bank: res.data.bank || res.data.entity_name || null,
            });
          } else {
            setCtaKeyLookup({ verified: false, holderName: null, bank: null });
          }
        } catch {
          if (!cancelled) setCtaKeyLookup({ verified: false, holderName: null, bank: null });
        } finally {
          if (!cancelled) setCtaKeyLookupLoading(false);
        }
      });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ctaForm.tipo, ctaForm.llave]);

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

  // ── Cuánto se le ha enviado a cada beneficiario (hoy / mes / año) ──────
  // bepay_transactions no tiene un beneficiary_id — se relaciona con el
  // beneficiario por ben_doc_number, que es lo único estable que se guarda
  // en cada dispersión (el nombre puede repetirse, el documento no). Solo
  // trae lo del año en curso — es lo único que hace falta para los 3
  // acumulados (hoy y este mes ya están dentro de este año), así no se
  // arrastra el historial completo de dispersiones cada vez que se abre la
  // pantalla.
  const [sentTxns, setSentTxns] = useState<{ amount: number; ben_doc_number: string | null; created_at: string }[]>([]);
  const loadSentStats = useCallback(async () => {
    if (!user) return;
    // Refresca las dispersiones propias que sigan en PENDING antes de leer —
    // sin esto, esta pantalla es la única del panel que no sincroniza con el
    // estado real de Bepay al cargar (Movimientos, Estado de Cuenta e Inicio
    // ya lo hacen), y una dispersión que ya se completó del lado de Bepay
    // seguía mostrando $0 acá hasta que alguien la sincronizara a mano.
    try { await syncMyPayouts(); } catch { /* no bloquea la carga */ }
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const { data } = await supabase
      .from("bepay_transactions")
      .select("amount, ben_doc_number, created_at")
      .eq("user_id", user.id)
      .eq("type", "payout")
      .in("status", ["APPROVED", "COMPLETED"])
      .gte("created_at", startOfYear);
    setSentTxns((data ?? []) as { amount: number; ben_doc_number: string | null; created_at: string }[]);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadSentStats();
    });
    return () => { cancelled = true; };
  }, [loadSentStats]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("bens-sent-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "bepay_transactions", filter: "user_id=eq." + user.id }, () => loadSentStats())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadSentStats]);

  // Agrupado por documento del beneficiario, con los 3 acumulados ya listos
  // para pintar — se recalcula solo cuando cambian las transacciones, no en
  // cada render.
  const sentStatsByDoc = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();
    const map = new Map<string, { hoy: number; mes: number; anio: number; hoyCount: number; mesCount: number; anioCount: number }>();
    for (const t of sentTxns) {
      const doc = (t.ben_doc_number || "").trim();
      if (!doc) continue;
      const d = new Date(t.created_at);
      const entry = map.get(doc) ?? { hoy: 0, mes: 0, anio: 0, hoyCount: 0, mesCount: 0, anioCount: 0 };
      entry.anio += t.amount;
      entry.anioCount += 1;
      if (d.getMonth() === now.getMonth()) { entry.mes += t.amount; entry.mesCount += 1; }
      if (d.toDateString() === todayKey) { entry.hoy += t.amount; entry.hoyCount += 1; }
      map.set(doc, entry);
    }
    return map;
  }, [sentTxns]);

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
    // La cuenta debe pertenecer a la misma persona que se está registrando —
    // se pide confirmar el documento por separado para no dar por hecho que
    // quien llena el formulario no se equivocó de cuenta/beneficiario.
    if (ctaForm.confirmDoc.trim() !== bForm.numdoc.trim()) {
      onToast("error", "El documento no coincide", "El número de documento de la cuenta debe ser el mismo del titular (" + bForm.numdoc + ")");
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
        bank_name: ctaForm.tipo === "Bre-B" ? (ctaKeyLookup?.bank ?? "Sin identificar") : ctaForm.banco,
        account_key: ctaForm.tipo === "Bre-B" ? ctaForm.llave : ctaForm.num,
        is_active: true,
      });

      if (ctaErr) throw new Error(ctaErr.message);

      onToast("ok", "Beneficiario guardado", bForm.nombre);
      setBForm({ tipodoc: "CC", numdoc: "", nombre: "", celular: "", correo: "" });
      setCtaForm({ tipo: "", banco: "", num: "", llave: "", confirmDoc: "" });
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

    const targetBen = bens.find((b) => b.id === newCtaTarget);
    if (!targetBen) {
      onToast("error", "Error", "No se encontró el beneficiario");
      return;
    }
    // Misma validación que al crear un beneficiario nuevo: la cuenta que se
    // agrega debe ser del mismo titular, no de otra persona por error.
    if (ctaForm.confirmDoc.trim() !== targetBen.doc_number.trim()) {
      onToast("error", "El documento no coincide", "El número de documento de la cuenta debe ser el mismo de " + targetBen.full_name + " (" + targetBen.doc_number + ")");
      return;
    }

    setSavingCta(true);
    try {
      const { error } = await supabase.from("beneficiary_accounts").insert({
        beneficiary_id: newCtaTarget,
        account_type: ctaForm.tipo,
        bank_name: ctaForm.tipo === "Bre-B" ? (ctaKeyLookup?.bank ?? "Sin identificar") : ctaForm.banco,
        account_key: ctaForm.tipo === "Bre-B" ? ctaForm.llave : ctaForm.num,
        is_active: true,
      });

      if (error) throw new Error(error.message);

      onToast("ok", "Cuenta agregada", ctaForm.tipo);
      setCtaForm({ tipo: "", banco: "", num: "", llave: "", confirmDoc: "" });
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

  // La cuenta debe confirmarse con el mismo documento del titular — se
  // calcula acá para deshabilitar los botones de guardar, además del toast
  // de error al intentar enviar (feedback inmediato en vez de solo al enviar).
  const newBenDocMismatch = !ctaForm.confirmDoc || ctaForm.confirmDoc.trim() !== bForm.numdoc.trim();
  const newCtaTargetBen = bens.find((b) => b.id === newCtaTarget);
  const newCtaDocMismatch = !ctaForm.confirmDoc || ctaForm.confirmDoc.trim() !== (newCtaTargetBen?.doc_number ?? "").trim();

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
    <div className="ben">
      {/* Encabezado */}
      <div style={{ marginBottom: "18px" }}>
        <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px", color: "var(--t1)" }}>Beneficiarios</h1>
        <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>Gestiona los beneficiarios de tus dispersiones</p>
      </div>

      <React.Fragment>
          {/* Stats */}
          <div className="ben-stats">
            {[
              { label: "Total Beneficiarios", value: bens.length, icon: "ti-users", color: "var(--accent)" },
              { label: "Total Cuentas", value: bens.reduce((s, b) => s + b.accounts.length, 0), icon: "ti-credit-card", color: "var(--success)" },
            ].map((s) => (
              <div key={s.label} className="ben-stat">
                <div className="ben-stat__icon" style={{ color: s.color }}>
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
          <div className="ben-toolbar">
            <div className="ben-toolbar__search">
              <i className="ti ti-search" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, documento o banco..." style={{ ...inputStyle, paddingLeft: "30px" }} />
            </div>
            <div className="ben-toolbar__actions">
              <button onClick={() => setQuery("")} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer", fontSize: "13px" }}>
                Limpiar
              </button>
              <button onClick={loadBens} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", cursor: "pointer" }}>
                <i className="ti ti-refresh" />
              </button>
              <button
                onClick={() => {
                  setCtaForm({ tipo: "", banco: "", num: "", llave: "", confirmDoc: "" });
                  setNewBenOpen(true);
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
              >
                <i className="ti ti-plus" />
                Nuevo Beneficiario
              </button>
            </div>
          </div>

          <div className="ben-listTitle">Lista de Beneficiarios</div>

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
                <div key={b.id} className="ben-card">
                  <div className="ben-card__head" onClick={() => toggleOpen(b.id)}>
                    <div className="ben-card__avatar">{iniciales(b.full_name)}</div>
                    <div className="ben-card__main">
                      <div className="ben-card__name">{b.full_name}</div>
                      <div className="ben-card__chips">
                        <div className="ben-chip">
                          <span className="ben-chip__k">Documento</span>
                          <span className="ben-chip__v ben-chip__v--mono">{b.doc_type} {b.doc_number}</span>
                        </div>
                        <div className="ben-chip">
                          <span className="ben-chip__k">Celular</span>
                          <span className="ben-chip__v">{b.phone ? `+57 ${b.phone}` : "—"}</span>
                        </div>
                        <div className="ben-chip">
                          <span className="ben-chip__k">Correo</span>
                          <span className="ben-chip__v">{b.email || "—"}</span>
                        </div>
                        <div className="ben-chip">
                          <span className="ben-chip__k">Registrado</span>
                          <span className="ben-chip__v">{formatDate(b.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="ben-card__side">
                      <span className="ben-card__count">
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
                    <div className="ben-card__body">
                      <div className="ben-section">
                        <div className="ben-section__title">Datos del Titular</div>
                        <div className="ben-titularGrid">
                          {[
                            { label: "Nombre completo", value: b.full_name, mono: false },
                            { label: "Tipo documento", value: b.doc_type, mono: false },
                            { label: "Número documento", value: b.doc_number, mono: true },
                            { label: "Celular", value: b.phone ? "+57 " + b.phone : "—", mono: false },
                            { label: "Correo", value: b.email || "—", mono: false },
                            { label: "Registrado", value: formatDate(b.created_at), mono: false },
                            { label: "ID beneficiario", value: b.id, mono: true },
                            { label: "Cuentas activas", value: String(b.accounts.filter((c) => c.is_active).length), mono: false },
                            { label: "Total cuentas", value: String(b.accounts.length), mono: false },
                          ].map((row) => (
                            <div key={row.label} className="ben-titularItem">
                              <div className="ben-titularItem__k">{row.label}</div>
                              <div className={"ben-titularItem__v" + (row.mono ? " ben-titularItem__v--mono" : "")}>{row.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="ben-section">
                        <div className="ben-section__title">Enviado a este beneficiario</div>
                        <div className="ben-sentGrid">
                          {(() => {
                            const stats = sentStatsByDoc.get(b.doc_number.trim()) ?? { hoy: 0, mes: 0, anio: 0, hoyCount: 0, mesCount: 0, anioCount: 0 };
                            return [
                              { label: "Hoy", amount: stats.hoy, count: stats.hoyCount },
                              { label: "Este mes", amount: stats.mes, count: stats.mesCount },
                              { label: "Este año", amount: stats.anio, count: stats.anioCount },
                            ].map((row) => (
                              <div key={row.label} className="ben-sentItem">
                                <div className="ben-sentItem__k">{row.label}</div>
                                <div className="ben-sentItem__v" style={{ color: row.amount > 0 ? "var(--t1)" : "var(--t3)" }}>{fmtCOP(row.amount)}</div>
                                <div className="ben-sentItem__c">{row.count} dispersión{row.count !== 1 ? "es" : ""}</div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>

                      <div className="ben-section">
                        <div className="ben-accountsHead">
                          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--t2)" }}>Cuentas bancarias</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewCtaTarget(b.id);
                              setCtaForm({ tipo: "", banco: "", num: "", llave: "", confirmDoc: "" });
                            }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer" }}
                          >
                            <i className="ti ti-plus" /> Agregar cuenta
                          </button>
                        </div>

                        {b.accounts.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "var(--t3)", fontSize: "12px" }}>Sin cuentas registradas</div>
                        ) : (
                          <>
                            <div className="ben-accountCards">
                              {b.accounts.map((c) => (
                                <div key={c.id} className="ben-accountCard">
                                  <div className="ben-accountCard__row">
                                    <span className="ben-accountCard__k">Banco</span>
                                    <span className="ben-accountCard__v">{c.bank_name || "—"}</span>
                                  </div>
                                  <div className="ben-accountCard__row">
                                    <span className="ben-accountCard__k">Tipo</span>
                                    <span className="ben-accountCard__v"><StatusBadge value={c.account_type} /></span>
                                  </div>
                                  <div className="ben-accountCard__row">
                                    <span className="ben-accountCard__k">Número / Llave</span>
                                    <span className="ben-accountCard__v ben-accountCard__v--mono">{c.account_key}</span>
                                  </div>
                                  <div className="ben-accountCard__row">
                                    <span className="ben-accountCard__k">Estado</span>
                                    <span className="ben-accountCard__v"><StatusBadge value={c.is_active ? "Activa" : "Inactiva"} /></span>
                                  </div>
                                  <div className="ben-accountCard__row">
                                    <span className="ben-accountCard__k">ID cuenta</span>
                                    <span className="ben-accountCard__v ben-accountCard__v--mono">{c.id}</span>
                                  </div>
                                  <button onClick={() => handleDeleteCta(c.id, c.bank_name)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--t3)", fontSize: 13, padding: "8px", marginTop: 4 }}>
                                    <i className="ti ti-trash" /> Eliminar cuenta
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="ben-accountsTableWrap">
                              <table className="ben-accountsTable">
                                <thead>
                                  <tr>
                                    {["Banco", "Tipo", "Número / Llave", "Estado", "ID", ""].map((h) => (
                                      <th key={h}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {b.accounts.map((c) => (
                                    <tr key={c.id}>
                                      <td style={{ color: "var(--t1)" }}>{c.bank_name}</td>
                                      <td><StatusBadge value={c.account_type} /></td>
                                      <td style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--t2)" }}>{c.account_key}</td>
                                      <td><StatusBadge value={c.is_active ? "Activa" : "Inactiva"} /></td>
                                      <td style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "var(--t3)" }}>{c.id}</td>
                                      <td>
                                        <button onClick={() => handleDeleteCta(c.id, c.bank_name)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "14px" }}>
                                          <i className="ti ti-trash" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
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
                <button onClick={handleSaveBen} disabled={savingBen || newBenDocMismatch} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: savingBen || newBenDocMismatch ? "not-allowed" : "pointer", opacity: savingBen || newBenDocMismatch ? 0.6 : 1 }}>
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
                <select value={bForm.tipodoc} onChange={(e) => bf("tipodoc")(e.target.value)} style={inputStyle} disabled={docTypesLoading}>
                  {docTypesLoading ? <option value="">Cargando...</option> : null}
                  {docTypeOptions.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
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
                {ctaKeyLookupLoading ? (
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>Identificando banco de la llave...</div>
                ) : ctaKeyLookup?.verified && ctaKeyLookup.bank ? (
                  <div style={{ fontSize: "11px", color: "var(--success)", marginTop: "6px" }}>
                    <i className="ti ti-shield-check" style={{ marginRight: "3px" }} />
                    Banco identificado: {ctaKeyLookup.bank}
                    {ctaKeyLookup.holderName ? " · " + ctaKeyLookup.holderName : ""}
                  </div>
                ) : ctaKeyLookup && !ctaKeyLookup.verified ? (
                  <div style={{ fontSize: "11px", color: "var(--warning)", marginTop: "6px" }}>
                    No se pudo identificar el banco de esta llave — se guardará como "Sin identificar"
                  </div>
                ) : null}
              </div>
            ) : null}
            {ctaForm.tipo ? (
              <div style={{ marginTop: "12px" }}>
                <label style={labelStyle}>
                  Confirma el número de documento del titular de esta cuenta <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  value={ctaForm.confirmDoc}
                  onChange={(e) => cf("confirmDoc")(e.target.value)}
                  placeholder="Repite el número de documento de arriba"
                  style={{
                    ...inputStyle,
                    borderColor: ctaForm.confirmDoc && ctaForm.confirmDoc.trim() !== bForm.numdoc.trim() ? "var(--error)" : undefined,
                  }}
                />
                {ctaForm.confirmDoc && ctaForm.confirmDoc.trim() !== bForm.numdoc.trim() ? (
                  <div style={{ fontSize: "11px", color: "var(--error)", marginTop: "4px" }}>No coincide con el número de documento del titular</div>
                ) : (
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>Debe ser el mismo documento que la cuenta receptora tiene registrado en su banco</div>
                )}
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
                <button onClick={handleSaveCta} disabled={!ctaForm.tipo || savingCta || newCtaDocMismatch} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: !ctaForm.tipo || newCtaDocMismatch ? "not-allowed" : "pointer", opacity: !ctaForm.tipo || savingCta || newCtaDocMismatch ? 0.5 : 1 }}>
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
                {ctaKeyLookupLoading ? (
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>Identificando banco de la llave...</div>
                ) : ctaKeyLookup?.verified && ctaKeyLookup.bank ? (
                  <div style={{ fontSize: "11px", color: "var(--success)", marginTop: "6px" }}>
                    <i className="ti ti-shield-check" style={{ marginRight: "3px" }} />
                    Banco identificado: {ctaKeyLookup.bank}
                    {ctaKeyLookup.holderName ? " · " + ctaKeyLookup.holderName : ""}
                  </div>
                ) : ctaKeyLookup && !ctaKeyLookup.verified ? (
                  <div style={{ fontSize: "11px", color: "var(--warning)", marginTop: "6px" }}>
                    No se pudo identificar el banco de esta llave — se guardará como "Sin identificar"
                  </div>
                ) : null}
              </div>
            ) : null}
            {ctaForm.tipo ? (() => {
              const targetBen = bens.find((b) => b.id === newCtaTarget);
              const targetDoc = targetBen?.doc_number ?? "";
              const mismatch = !!ctaForm.confirmDoc && ctaForm.confirmDoc.trim() !== targetDoc.trim();
              return (
                <div style={{ marginTop: "12px" }}>
                  <label style={labelStyle}>
                    Confirma el número de documento de {targetBen?.full_name ?? "el titular"} <span style={{ color: "var(--accent)" }}>*</span>
                  </label>
                  <input
                    value={ctaForm.confirmDoc}
                    onChange={(e) => cf("confirmDoc")(e.target.value)}
                    placeholder={"Ej. " + targetDoc}
                    style={{ ...inputStyle, borderColor: mismatch ? "var(--error)" : undefined }}
                  />
                  {mismatch ? (
                    <div style={{ fontSize: "11px", color: "var(--error)", marginTop: "4px" }}>No coincide con el documento registrado de {targetBen?.full_name}</div>
                  ) : (
                    <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>Debe ser el mismo documento que la cuenta receptora tiene registrado en su banco</div>
                  )}
                </div>
              );
            })() : null}
          </Modal>
      </React.Fragment>
    </div>
  );
};