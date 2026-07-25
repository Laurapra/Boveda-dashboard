// src/pages/Billeteras.tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { createVirtualKey, getVirtualKeys, deactivateVirtualKey } from "../lib/bepayClient";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import type { ToastType } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// ── Una "billetera" = una llave virtual real en breb_keys ──────────
interface WalletKey {
  id: string;
  key_value: string;
  reference: string | null;
  status: string;
  total_received: number;
  created_at: string;
}

interface WalletTx {
  id: string;
  bepay_ide: string | null;
  type: "charge" | "payout";
  amount: number;
  concept: string;
  status: string;
  created_at: string;
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

// ── Divisas soportadas — hoy Bepay solo opera en COP.               ──
// ── Esta estructura queda lista para cuando agreguen más divisas.   ──
interface CurrencyConfig {
  code: string;
  name: string;
  icon: string;
  available: boolean;
}

const CURRENCIES: CurrencyConfig[] = [
  { code: "COP", name: "Peso colombiano", icon: "ti-coin", available: true },
  { code: "USD", name: "Dólar estadounidense", icon: "ti-currency-dollar", available: false },
  { code: "EUR", name: "Euro", icon: "ti-currency-euro", available: false },
];

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

export const BilleterasView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user } = useAuthStore();

  const [wallets, setWallets] = useState<WalletKey[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [walletTxns, setWalletTxns] = useState<WalletTx[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalCurrency, setModalCurrency] = useState<string>("COP");
  const [reference, setReference] = useState("");
  const [creating, setCreating] = useState(false);

  const [doneOpen, setDoneOpen] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState("");

  const wallet = wallets.find((w) => w.id === detailId) ?? null;

  // ── Cargar billeteras (llaves virtuales reales) ─────────────────
  // Hoy todas pertenecen a COP porque es la única divisa que Bepay opera.
  const loadWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const res: GetVirtualKeysResponse = await getVirtualKeys();
      const list = Array.isArray(res?.data) ? res.data : [];
      setWallets(list.filter((w) => w.status === "ACTIVE"));
    } catch (err) {
      onToast("error", "Error cargando billeteras", getErrorMessage(err));
    } finally {
      setWalletsLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadWallets();
    });
    return () => {
      cancelled = true;
    };
  }, [loadWallets]);

  // Realtime — se refleja de inmediato si se crea/actualiza una llave
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("wallets-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "breb_keys", filter: "user_id=eq." + user.id },
        () => loadWallets()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadWallets]);

  // ── Cargar historial de ingresos de la billetera seleccionada ───
  const loadWalletTxns = useCallback(async () => {
    if (!wallet) return;
    setTxnsLoading(true);
    try {
      const { data, error } = await supabase
        .from("bepay_transactions")
        .select("id, bepay_ide, type, amount, concept, status, created_at")
        .eq("account_key", wallet.key_value)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw new Error(error.message);
      setWalletTxns((data ?? []) as WalletTx[]);
    } catch (err) {
      onToast("error", "Error cargando historial", getErrorMessage(err));
    } finally {
      setTxnsLoading(false);
    }
  }, [wallet, onToast]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      if (!wallet) {
        setWalletTxns([]);
        return;
      }
      await loadWalletTxns();
    });
    return () => {
      cancelled = true;
    };
  }, [wallet, loadWalletTxns]);

  // ── Crear billetera = crear llave virtual real y distinta ───────
  const handleCreate = async () => {
    setCreating(true);
    try {
      const res: CreateVirtualKeyResponse = await createVirtualKey(reference.trim() || undefined);

      if (!res || res.success === false) {
        onToast("error", "No se pudo crear la billetera", res?.error ?? "Inténtalo de nuevo");
        return;
      }

      const created = res.data;
      setNewKeyValue(created?.key_value ?? "");
      onToast("ok", "Billetera creada", "Nueva llave: " + (created?.key_value ?? ""));
      setReference("");
      setModalOpen(false);
      setDoneOpen(true);
      await loadWallets();
    } catch (err) {
      onToast("error", "Error", getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const openCreateModal = (currencyCode: string) => {
    setModalCurrency(currencyCode);
    setModalOpen(true);
  };

  const handleDeactivate = async (keyId: string, keyValue: string) => {
    if (!confirm("¿Desactivar la billetera @" + keyValue + "? Dejará de recibir cobros.")) return;
    try {
      await deactivateVirtualKey(keyId);
      onToast("ok", "Billetera desactivada", "@" + keyValue);
      if (detailId === keyId) setDetailId(null);
      await loadWallets();
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

  function statusLabel(s: string) {
    if (s === "APPROVED" || s === "COMPLETED") return "Completado";
    if (s === "PENDING") return "Pendiente";
    return "Rechazado";
  }

  // ── Vista detalle de billetera ────────────────────────────────
  if (wallet !== null) {
    return (
      <div style={{ animation: "fadeUp .3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button
              onClick={() => setDetailId(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "13px", cursor: "pointer" }}
            >
              ← Mis billeteras
            </button>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--t1)" }}>COP</span>
                <StatusBadge value="Activa" />
              </div>
              <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>Bre-B · Llave virtual{wallet.reference ? " · " + wallet.reference : ""}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "4px" }}>Total recibido</div>
            <div style={{ fontSize: "24px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--t1)" }}>{fmt(wallet.total_received)}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
          {[
            { label: "Divisa", val: "Peso colombiano (COP)", mono: false },
            { label: "Tipo", val: "Bre-B", mono: false },
            { label: "Llave", val: wallet.key_value, mono: true },
          ].map((p) => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "12px" }}>
              <span style={{ color: "var(--t3)" }}>{p.label}</span>
              <span style={{ fontWeight: 500, color: "var(--t1)", fontFamily: p.mono ? "var(--mono)" : undefined }}>{p.val}</span>
              {p.mono ? (
                <button
                  onClick={() => handleCopy(p.val)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "13px", padding: 0, display: "flex" }}
                >
                  <i className="ti ti-copy" style={{ fontSize: "13px" }} />
                </button>
              ) : null}
            </div>
          ))}
          <button
            onClick={() => handleDeactivate(wallet.id, wallet.key_value)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "20px", fontSize: "12px", color: "var(--error)", fontWeight: 600, cursor: "pointer" }}
          >
            <i className="ti ti-power" style={{ fontSize: "13px" }} />
            Desactivar
          </button>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <i className="ti ti-history" style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Ingresos de esta billetera</span>
            </div>
            <button
              onClick={loadWalletTxns}
              style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <i className="ti ti-refresh" /> Actualizar
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Fecha", "Concepto", "Monto", "Estado"].map((h) => (
                    <th key={h} style={{ ...thStyle, textAlign: h === "Monto" ? "right" : "left" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txnsLoading ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>
                      Cargando…
                    </td>
                  </tr>
                ) : walletTxns.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>
                      Sin ingresos registrados con esta llave todavía
                    </td>
                  </tr>
                ) : (
                  walletTxns.map((t) => (
                    <tr key={t.id} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={tdStyle}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 500, color: "var(--t2)" }}>{t.bepay_ide ?? t.id.slice(0, 12)}</div>
                        <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>{formatDateTime(t.created_at)}</div>
                      </td>
                      <td style={{ ...tdStyle, fontSize: "12px", color: "var(--t1)" }}>{t.concept}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: t.type === "charge" ? "var(--success)" : "var(--error)" }}>
                        {t.type === "charge" ? "+" : "-"}
                        {fmt(t.amount)}
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge value={statusLabel(t.status)} />
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
  }

  // ── Vista listado agrupado por divisa ───────────────────────────
  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Mis billeteras</div>
        <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>Organizadas por divisa — cada llave identifica tus cobros de forma única</div>
      </div>

      {CURRENCIES.map((cur) => {
        // Hoy todas las billeteras existentes son COP (única divisa operativa en Bepay)
        const currencyWallets = cur.code === "COP" ? wallets : [];
        const currencyTotal = currencyWallets.reduce((sum, w) => sum + w.total_received, 0);

        return (
          <div key={cur.code} style={{ marginBottom: "28px" }}>
            {/* Encabezado de la divisa */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "10px",
                    background: cur.available ? "var(--accent-dim)" : "var(--elevated)",
                    display: "grid",
                    placeItems: "center",
                    color: cur.available ? "var(--accent)" : "var(--t3)",
                    flexShrink: 0,
                  }}
                >
                  <i className={"ti " + cur.icon} style={{ fontSize: "19px" }} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--t1)" }}>{cur.code}</span>
                    <span style={{ fontSize: "12.5px", color: "var(--t3)" }}>{cur.name}</span>
                    {!cur.available ? (
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", background: "var(--elevated)", color: "var(--t3)" }}>PRÓXIMAMENTE</span>
                    ) : null}
                  </div>
                  {cur.available ? (
                    <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>
                      Total registrado: <span style={{ fontWeight: 600, color: "var(--t1)" }}>{fmt(currencyTotal)}</span> · {currencyWallets.length} billetera{currencyWallets.length !== 1 ? "s" : ""}
                    </div>
                  ) : null}
                </div>
              </div>

              {cur.available ? (
                <button
                  onClick={() => openCreateModal(cur.code)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}
                >
                  <i className="ti ti-plus" />
                  Crear llave {cur.code}
                </button>
              ) : (
                <span style={{ fontSize: "12px", color: "var(--t3)" }}>No disponible aún</span>
              )}
            </div>

            {/* Grid de billeteras de esta divisa */}
            {cur.available ? (
              walletsLoading ? (
                <div style={{ textAlign: "center", padding: "32px", color: "var(--t3)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                  </svg>
                </div>
              ) : currencyWallets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px", background: "var(--elevated)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)", color: "var(--t3)" }}>
                  <i className="ti ti-wallet" style={{ fontSize: "22px", display: "block", marginBottom: "8px", opacity: 0.4 }} />
                  <div style={{ fontSize: "13px" }}>
                    Sin billeteras en {cur.code} todavía — crea la primera con <strong style={{ color: "var(--t2)" }}>Crear llave {cur.code}</strong>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                  {currencyWallets.map((w) => (
                    <div
                      key={w.id}
                      onClick={() => setDetailId(w.id)}
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "18px", cursor: "pointer", transition: ".12s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: "var(--accent-dim)", display: "grid", placeItems: "center", color: "var(--accent)" }}>
                          <i className="ti ti-wallet" style={{ fontSize: "18px" }} />
                        </div>
                        <StatusBadge value="Activa" />
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--t1)", marginBottom: "2px" }}>{cur.code}</div>
                      <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "10px", fontFamily: "var(--mono)" }}>@{w.key_value}</div>
                      <div style={{ fontSize: "18px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--t1)" }}>{fmt(w.total_received)}</div>
                      <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>Total recibido</div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>
        );
      })}

      {/* ── Modal nueva billetera ── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setReference("");
        }}
        title={"Nueva billetera " + modalCurrency}
        subtitle="Se generará una llave virtual única para identificar sus ingresos"
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
              disabled={creating}
              style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer", opacity: creating ? 0.6 : 1 }}
            >
              <i className="ti ti-wallet" style={{ marginRight: "6px" }} />
              {creating ? "Creando…" : "Crear billetera"}
            </button>
          </>
        }
      >
        <div style={{ padding: "14px", background: "var(--elevated)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--accent-dim)", display: "grid", placeItems: "center", color: "var(--accent)", flexShrink: 0 }}>
            <i className="ti ti-building-bank" style={{ fontSize: "20px" }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--t1)" }}>
              {CURRENCIES.find((c) => c.code === modalCurrency)?.name ?? modalCurrency} · {modalCurrency}
            </div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>Bre-B · llave virtual generada automáticamente</div>
          </div>
        </div>
        <Input label="Nombre de la billetera (opcional)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. Ventas online, Sucursal norte" help="Te ayuda a diferenciarla — la llave se genera automáticamente" />
      </Modal>

      {/* ── Modal billetera creada exitosamente ── */}
      <Modal
        isOpen={doneOpen}
        onClose={() => setDoneOpen(false)}
        title="¡Billetera creada!"
        subtitle="Tu nueva llave está lista para recibir pagos"
        footer={
          <button
            onClick={() => setDoneOpen(false)}
            style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer" }}
          >
            <i className="ti ti-check" style={{ marginRight: "6px" }} />
            Listo
          </button>
        }
      >
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 14px", fontSize: "24px" }}>
            <i className="ti ti-check" />
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "8px", color: "var(--t1)" }}>Billetera {modalCurrency} activa</div>
          <div style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "12px" }}>Tu llave para identificar ingresos:</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "var(--mono)", fontSize: "14px", fontWeight: 600, color: "var(--accent)" }}>
            @{newKeyValue}
            <button onClick={() => handleCopy(newKeyValue)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "14px" }}>
              <i className="ti ti-copy" />
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};