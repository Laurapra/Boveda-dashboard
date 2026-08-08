// src/pages/Billeteras.tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { createVirtualKey, getVirtualKeys, deactivateVirtualKey, getBrebRegistration } from "../lib/bepayClient";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import type { ToastType } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// Las llaves creadas a partir del fix de formato Bre-B ya incluyen "@"; las
// creadas antes no. Este helper evita mostrar "@@..." con las viejas.
const atKey = (v: string) => (v.startsWith("@") ? v : `@${v}`);

// ── La billetera del usuario = su única llave virtual real en breb_keys ──
interface WalletKey {
  id: string;
  key_value: string;
  reference: string | null;
  status: string;
  total_received: number;
  created_at: string;
}

// Movimiento unificado — cobros (de esta llave) + dispersiones (todas)
interface WalletMovement {
  id: string;
  bepay_ide: string | null;
  type: "charge" | "payout";
  amount: number;
  concept: string;
  status: string;
  ben_name: string | null;
  payer_name: string | null;
  bank_name: string | null;
  account_type: string | null;
  payment_method: string | null;
  comision_total: number | null;
  created_at: string;
}

// Nombre a mostrar según el tipo de movimiento: quién te pagó (cobro) o a
// quién le enviaste (dispersión) — son campos distintos en la misma tabla.
function counterpartyName(m: WalletMovement): string | null {
  return m.type === "charge" ? m.payer_name : m.ben_name;
}

interface CreateVirtualKeyResponse {
  success: boolean;
  data?: WalletKey;
  error?: string;
}

interface GetVirtualKeysResponse {
  success: boolean;
  data?: WalletKey[];
  error?: string;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(s: string): string {
  if (s === "APPROVED" || s === "COMPLETED") return "Completado";
  if (s === "PENDING") return "Pendiente";
  return "Rechazado";
}

// Concepto automático según el producto — ej: "Recaudo llave Bre-B",
// "Recaudo QR dinámico Bre-B", "Dispersión ACH". Se clasifica por palabras
// clave sobre payment_method/concept (los nombres exactos que manda Bepay
// no están 100% documentados para todos los productos) en vez de una lista
// cerrada, así un valor nuevo no reconocido cae en un rótulo genérico
// razonable en vez de romper la tabla.
function conceptLabel(m: WalletMovement): string {
  if (m.type === "payout") {
    return m.account_type === "Bre-B" ? "Dispersión Bre-B" : "Dispersión ACH";
  }

  const raw = `${m.payment_method ?? ""} ${m.concept ?? ""}`.toUpperCase();
  const isQr = raw.includes("QR");
  const isStatic = raw.includes("STATIC") || raw.includes("ESTATIC") || raw.includes("ESTÁTIC");

  if (raw.includes("NEQUI")) return "Recaudo Nequi Push";
  if (isQr && isStatic) return "Recaudo QR Estático Bre-B";
  if (isQr) return "Recaudo QR dinámico Bre-B";
  if (raw.includes("BREB") || raw.includes("BRE-B") || raw.includes("MOVII")) return "Recaudo llave Bre-B";
  if (m.payment_method) {
    const method = m.payment_method.toLowerCase();
    return "Recaudo " + method.charAt(0).toUpperCase() + method.slice(1);
  }
  return "Recaudo";
}

export const BilleterasView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user } = useAuthStore();

  const [wallet, setWallet] = useState<WalletKey | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  const [movements, setMovements] = useState<WalletMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementFilter, setMovementFilter] = useState<"all" | "charge" | "payout">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending" | "rejected">("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Datos del registro Bre-B (cuenta 437 + subcomercio) para el form ──
  const [brebInfo, setBrebInfo] = useState<{ accountId: number; reference: string | null; registered: boolean } | null>(null);
  const [brebInfoLoading, setBrebInfoLoading] = useState(false);

  // Si el campo de llave se deja vacío, el backend genera automáticamente
  // BERAMPLIX + el siguiente consecutivo (formato confirmado con soporte
  // de Bepay el 2 ago 2026: máx. 13 car., prefijo BE obligatorio para usar
  // "RAMPLIX"). "BERAMPLIX" es un prefijo propio — no debería chocar con
  // el alias real de otra persona, a diferencia de palabras genéricas
  // como "jesus" o "minegocio" que sí chocaron en las pruebas.
  const loadBrebInfo = useCallback(async () => {
    setBrebInfoLoading(true);
    try {
      const info = await getBrebRegistration();
      setBrebInfo(info);
    } catch {
      setBrebInfo(null);
    } finally {
      setBrebInfoLoading(false);
    }
  }, []);

  // ── Cargar la única billetera del usuario (si existe) ────────────
  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const res: GetVirtualKeysResponse = await getVirtualKeys();
      const list = Array.isArray(res?.data) ? res.data : [];
      const active = list.filter((w) => w.status === "ACTIVE");
      setWallet(active.length > 0 ? active[0] : null);
    } catch (err) {
      onToast("error", "Error cargando billetera", getErrorMessage(err));
    } finally {
      setWalletLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadWallet();
    });
    return () => {
      cancelled = true;
    };
  }, [loadWallet]);

  // Realtime — se refleja de inmediato si se crea/actualiza la llave
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("wallet-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "breb_keys", filter: "user_id=eq." + user.id },
        () => loadWallet()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadWallet]);

  // ── Cargar movimientos unificados: ingresos de la llave + TODAS las dispersiones ──
  const loadMovements = useCallback(async () => {
    if (!wallet || !user) return;
    setMovementsLoading(true);
    try {
      const [chargesRes, payoutsRes] = await Promise.all([
        supabase
          .from("bepay_transactions")
          .select("id, bepay_ide, type, amount, concept, status, ben_name, payer_name, bank_name, account_type, payment_method, comision_total, created_at")
          .eq("account_key", wallet.key_value)
          .eq("type", "charge")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("bepay_transactions")
          .select("id, bepay_ide, type, amount, concept, status, ben_name, payer_name, bank_name, account_type, payment_method, comision_total, created_at")
          .eq("user_id", user.id)
          .eq("type", "payout")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (chargesRes.error) throw new Error(chargesRes.error.message);
      if (payoutsRes.error) throw new Error(payoutsRes.error.message);

      const merged = [...(chargesRes.data ?? []), ...(payoutsRes.data ?? [])] as WalletMovement[];
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setMovements(merged);
    } catch (err) {
      onToast("error", "Error cargando movimientos", getErrorMessage(err));
    } finally {
      setMovementsLoading(false);
    }
  }, [wallet, user, onToast]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      if (!wallet) {
        setMovements([]);
        return;
      }
      await loadMovements();
    });
    return () => {
      cancelled = true;
    };
  }, [wallet, loadMovements]);

  // Realtime de movimientos — se refleja apenas llegue un cobro o dispersión
  useEffect(() => {
    if (!user || !wallet) return;
    const channel = supabase
      .channel("wallet-movements-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bepay_transactions", filter: "user_id=eq." + user.id },
        () => loadMovements()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, wallet, loadMovements]);

  // ── Crear la billetera (única) = crear la llave virtual real ────
  // account_id siempre es 437 (fijo del lado del backend, no se manda desde
  // aquí) y "reference" en la llamada a Bepay es el subcomercio ya
  // registrado (brebInfo.reference) — nunca se inventa desde el formulario.
  // La llave (key_value) ya no la escribe el cliente — Ramplix asigna
  // siempre una llave personalizada generada automáticamente por el backend.
  const handleCreate = async () => {
    setCreating(true);
    try {
      const res: CreateVirtualKeyResponse = await createVirtualKey(reference.trim() || undefined, undefined);

      if (!res || res.success === false) {
        onToast("error", "No se pudo crear la billetera", res?.error ?? "Inténtalo de nuevo");
        return;
      }

      onToast("ok", "Billetera creada", "Llave: " + (res.data?.key_value ?? ""));
      setReference("");
      setModalOpen(false);
      await loadWallet();
    } catch (err) {
      onToast("error", "Error", getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!wallet) return;
    if (!confirm("¿Desactivar tu billetera " + atKey(wallet.key_value) + "? Dejará de recibir cobros.")) return;
    try {
      await deactivateVirtualKey(wallet.id);
      onToast("ok", "Billetera desactivada", atKey(wallet.key_value));
      await loadWallet();
    } catch (err) {
      onToast("error", "Error", getErrorMessage(err));
    }
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    onToast("ok", "Copiado", value);
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
    fontSize: "13px",
  };
  const thStyle: React.CSSProperties = {
    padding: "9px 12px",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: ".5px",
    color: "var(--t3)",
    borderBottom: "1px solid var(--border)",
  };

  // Mismo agrupamiento que usa statusLabel() para pintar el badge —
  // "completado" cubre APPROVED/COMPLETED, "pendiente" cubre PENDING, y
  // cualquier otro estado (REJECTED, FAILED, etc.) cae en "rechazado".
  const statusGroup = (s: string): "completed" | "pending" | "rejected" => {
    if (s === "APPROVED" || s === "COMPLETED") return "completed";
    if (s === "PENDING") return "pending";
    return "rejected";
  };
  const filteredMovements = movements.filter((m) =>
    (movementFilter === "all" || m.type === movementFilter) &&
    (statusFilter === "all" || statusGroup(m.status) === statusFilter)
  );
  const totalIngresos = movements.filter((m) => m.type === "charge" && (m.status === "APPROVED" || m.status === "COMPLETED")).reduce((s, m) => s + m.amount, 0);
  const totalDispersado = movements.filter((m) => m.type === "payout" && (m.status === "APPROVED" || m.status === "COMPLETED")).reduce((s, m) => s + m.amount, 0);

  // ── Cargando ──
  if (walletLoading) {
    return (
      <div style={{ textAlign: "center", padding: "60px", color: "var(--t3)" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
          <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // ── Sin billetera todavía — estado vacío con creación única ─────
  if (!wallet) {
    return (
      <div style={{ animation: "fadeUp .3s ease" }}>
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Mi billetera</div>
          <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>Bre-B · Peso colombiano (COP)</div>
        </div>

        <div style={{ textAlign: "center", padding: "48px 20px", background: "var(--surface)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "var(--elevated)", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "var(--t3)" }}>
            <i className="ti ti-wallet" style={{ fontSize: "26px", opacity: 0.5 }} />
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "6px", color: "var(--t2)" }}>Aún no tienes billetera</div>
          <div style={{ fontSize: "13px", color: "var(--t3)", marginBottom: "20px" }}>
            Crea tu billetera para empezar a recibir cobros e identificar tus ingresos
          </div>
          <button
            onClick={() => {
              setModalOpen(true);
              loadBrebInfo();
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
          >
            <i className="ti ti-plus" />
            Crear billetera
          </button>
        </div>

        <Modal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setReference("");
          }}
          title="Nueva billetera"
          subtitle="Registro Bre-B — cuenta Ramplix"
          footer={
            <>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setReference("");
                }}
                style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || brebInfoLoading || !brebInfo?.reference}
                style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer", opacity: creating || brebInfoLoading || !brebInfo?.reference ? 0.6 : 1 }}
              >
                <i className="ti ti-wallet" style={{ marginRight: "6px" }} />
                {creating ? "Creando…" : "Crear billetera"}
              </button>
            </>
          }
        >
          <div style={{ padding: "14px", background: "var(--elevated)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--accent-dim)", display: "grid", placeItems: "center", color: "var(--accent)", flexShrink: 0 }}>
              <i className="ti ti-building-bank" style={{ fontSize: "20px" }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--t1)" }}>Peso colombiano · COP</div>
              <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>Bre-B</div>
            </div>
          </div>

          {!brebInfoLoading && brebInfo && !brebInfo.reference ? (
            <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--error)", marginBottom: "14px" }}>
              Todavía no tienes un registro Bre-B válido en Bepay. Pídele al administrador que revise tu onboarding y use "Reintentar Bre-B" antes de crear la billetera.
            </div>
          ) : null}

          <Input
            label="Identificación interna"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ej. Juan Pérez, Mi Negocio S.A.S."
            help="Es el nombre de la persona o empresa que va a aparecer en la llave"
          />
        </Modal>
      </div>
    );
  }

  // ── Vista única de la billetera ──────────────────────────────────
  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--t1)" }}>Mi billetera COP</span>
            <StatusBadge value="Activa" />
          </div>
          <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>Bre-B · Llave virtual{wallet.reference ? " · " + wallet.reference : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "4px" }}>Saldo</div>
          <div style={{ fontSize: "24px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--t1)" }}>{fmt(user?.balance ?? 0)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
        {[
          { label: "Divisa", val: "Peso colombiano (COP)", mono: false },
          { label: "Tipo", val: "Bre-B", mono: false },
          { label: "Llave", val: atKey(wallet.key_value), mono: true },
        ].map((p) => (
          <div key={p.label} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "12px" }}>
            <span style={{ color: "var(--t3)" }}>{p.label}</span>
            <span style={{ fontWeight: 500, color: "var(--t1)", fontFamily: p.mono ? "var(--mono)" : undefined }}>{p.val}</span>
            {p.mono ? (
              <button onClick={() => handleCopy(p.val)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "13px", padding: 0, display: "flex" }}>
                <i className="ti ti-copy" style={{ fontSize: "13px" }} />
              </button>
            ) : null}
          </div>
        ))}
        <button
          onClick={handleDeactivate}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "20px", fontSize: "12px", color: "var(--error)", fontWeight: 600, cursor: "pointer" }}
        >
          <i className="ti ti-power" style={{ fontSize: "13px" }} />
          Desactivar
        </button>
      </div>

      {/* Resumen ingresos vs dispersado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "18px" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 18px" }}>
          <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "4px" }}>Ingresos de esta billetera</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>+{fmt(totalIngresos)}</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 18px" }}>
          <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "4px" }}>Total dispersado</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--error)", fontVariantNumeric: "tabular-nums" }}>-{fmt(totalDispersado)}</div>
        </div>
      </div>

      {/* Tabla unificada de movimientos */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <i className="ti ti-history" style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Movimientos</span>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <select
              id="movement-filter"
              name="movement-filter"
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value as "all" | "charge" | "payout")}
              style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "12px" }}
            >
              <option value="all">Todos</option>
              <option value="charge">Solo ingresos</option>
              <option value="payout">Solo dispersiones</option>
            </select>
            <select
              id="movement-status-filter"
              name="movement-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "completed" | "pending" | "rejected")}
              style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "12px" }}
            >
              <option value="all">Todos los estados</option>
              <option value="completed">Completado</option>
              <option value="pending">Pendiente</option>
              <option value="rejected">Rechazado</option>
            </select>
            <button
              onClick={loadMovements}
              style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <i className="ti ti-refresh" /> Actualizar
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Fecha", "Tipo", "Concepto", "De / Para", "Banco", "Monto", "Comisión", "Estado"].map((h) => (
                  <th key={h} style={{ ...thStyle, textAlign: h === "Monto" || h === "Comisión" ? "right" : "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movementsLoading ? (
                <tr>
                  <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>
                    Cargando…
                  </td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>
                    Sin movimientos registrados todavía
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => (
                  <tr key={m.id} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ ...tdStyle, fontSize: "12px", color: "var(--t2)" }}>{formatDateTime(m.created_at)}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 9px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: m.type === "charge" ? "var(--success)" : "var(--accent)",
                          background: m.type === "charge" ? "var(--success-dim)" : "var(--accent-dim)",
                        }}
                      >
                        <i className={"ti " + (m.type === "charge" ? "ti-arrow-down" : "ti-arrow-up")} style={{ fontSize: "12px" }} />
                        {m.type === "charge" ? "Recaudo" : "Dispersión"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "12.5px", color: "var(--t1)" }}>{conceptLabel(m)}</td>
                    <td style={{ ...tdStyle, fontSize: "12.5px", color: "var(--t1)" }}>{counterpartyName(m) ?? "—"}</td>
                    <td style={{ ...tdStyle, fontSize: "12px", color: "var(--t2)" }}>{m.bank_name ?? "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: m.type === "charge" ? "var(--success)" : "var(--error)" }}>
                      {m.type === "charge" ? "+" : "-"}
                      {fmt(m.amount)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>{m.comision_total ? fmt(m.comision_total) : "—"}</td>
                    <td style={tdStyle}>
                      <StatusBadge value={statusLabel(m.status)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};