// src/pages/Home.tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { getBepayBalance, syncMyPayouts } from "../lib/bepayClient";
import type { ToastType } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// ── Count-up animado ──────────────────────────────────────────────
function useCountUp(target: number) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let cur = 0;
    const step  = target / 55;
    const timer = setInterval(() => {
      cur += step;
      if (cur >= target) { setVal(target); clearInterval(timer); }
      else setVal(Math.round(cur));
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return val;
}

// ── Tipos internos ────────────────────────────────────────────────
interface TxRow {
  id: string;
  type: "charge" | "payout";
  amount: number;
  concept: string;
  status: string;
  ben_name: string | null;
  payer_name: string | null;
  account_type: string | null;
  payment_method: string | null;
  comision_total: number | null;
  created_at: string;
}

// Nombre a mostrar según el tipo de movimiento — mismo criterio que en
// Mis billeteras / Estado de Cuenta.
function counterpartyName(t: TxRow): string | null {
  return t.type === "charge" ? t.payer_name : t.ben_name;
}

// Concepto automático según el producto — mismo criterio que en Mis
// billeteras / Estado de Cuenta.
function conceptLabel(t: TxRow): string {
  if (t.type === "payout") {
    return t.account_type === "Bre-B" ? "Dispersión Bre-B" : "Dispersión ACH";
  }

  const raw = `${t.payment_method ?? ""} ${t.concept ?? ""}`.toUpperCase();
  const isQr = raw.includes("QR");
  const isStatic = raw.includes("STATIC") || raw.includes("ESTATIC") || raw.includes("ESTÁTIC");

  if (raw.includes("NEQUI")) return "Recaudo Nequi Push";
  if (isQr && isStatic) return "Recaudo QR Estático Bre-B";
  if (isQr) return "Recaudo QR dinámico Bre-B";
  if (raw.includes("BREB") || raw.includes("BRE-B") || raw.includes("MOVII")) return "Recaudo llave Bre-B";
  if (t.payment_method) {
    const method = t.payment_method.toLowerCase();
    return "Recaudo " + method.charAt(0).toUpperCase() + method.slice(1);
  }
  return "Recaudo";
}

interface Metrics {
  saldo:          number;
  recibido:       number;
  dispersado:     number;
  recCount:       number;
  dispCount:      number;
  congelado:      number;
  congeladoCount: number;
}

const EMPTY: Metrics = { saldo: 0, recibido: 0, dispersado: 0, recCount: 0, dispCount: 0, congelado: 0, congeladoCount: 0 };

export const HomeView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user }  = useAuthStore();
  const isAdmin   = user?.role === "admin";

  const [metrics,  setMetrics]  = useState<Metrics>(EMPTY);
  const [feed,     setFeed]     = useState<TxRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  // ── Animaciones ──────────────────────────────────────────────
  const saldoAnim = useCountUp(metrics.saldo);
  const recAnim   = useCountUp(metrics.recibido);
  const dispAnim  = useCountUp(metrics.dispersado);

  // ── Cargar datos reales ───────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Refresca las dispersiones propias que sigan en PENDING antes de leer
      // — sin esto se quedaban pendientes hasta que un admin sincronizara a
      // mano, y por eso nunca contaban en "Dispersado este mes".
      if (!isAdmin) {
        try { await syncMyPayouts(); } catch { /* no bloquea la carga */ }
      }

      // 1. Transacciones
      let q = supabase
        .from("bepay_transactions")
        .select("id, type, amount, concept, status, ben_name, payer_name, account_type, payment_method, comision_total, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isAdmin) q = q.eq("user_id", user.id);
      const { data: txns } = await q;
      const rows = (txns ?? []) as TxRow[];

      // 2. Saldo — admin ve el saldo real y global de la cuenta Bepay;
      // usuarios normales ven SU saldo propio (profiles.balance), que es la
      // fuente de verdad de cuánto pueden gastar. Antes esto se quedaba en 0
      // para no-admin (nunca se llenaba) y la tarjeta "Saldo disponible"
      // caía a mostrar "recibido este mes" en su lugar — mostrando un
      // número que no era el saldo real del usuario.
      let saldo = 0;
      if (isAdmin) {
        try {
          const res = await getBepayBalance();
          saldo = res?.data?.balance ?? 0;
        } catch { /* silencioso */ }
      } else {
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("balance")
            .eq("id", user.id)
            .single();
          saldo = Number(prof?.balance ?? 0);
        } catch { /* silencioso */ }
      }

      // 3. Calcular métricas del mes actual
      const now    = new Date();
      const delMes = rows.filter(t => {
        const d = new Date(t.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const completadas = delMes.filter(t => t.status === "APPROVED" || t.status === "COMPLETED");
      const recibidas   = completadas.filter(t => t.type === "charge");
      const dispersadas = completadas.filter(t => t.type === "payout");

      // Dispersiones en PENDING ahora mismo — su monto+comisión ya se
      // descontó del saldo apenas se enviaron (aunque Bepay todavía no
      // confirme si se completan o se rechazan), así que es plata
      // "congelada": ya no está disponible para gastar, pero tampoco salió
      // en definitiva. No se limita al mes actual — es una foto del estado
      // presente, no un acumulado del período.
      const congeladas = rows.filter(t => t.type === "payout" && t.status === "PENDING");

      setMetrics({
        saldo,
        recibido:       recibidas.reduce((s, t) => s + t.amount, 0),
        dispersado:     dispersadas.reduce((s, t) => s + t.amount, 0),
        recCount:       recibidas.length,
        dispCount:      dispersadas.length,
        congelado:      congeladas.reduce((s, t) => s + t.amount + (t.comision_total ?? 0), 0),
        congeladoCount: congeladas.length,
      });

      // 4. Feed: últimas 8
      setFeed(rows.slice(0, 8));

    } catch (err: any) {
      onToast("error", "Error", err.message);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("home-rt")
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "bepay_transactions",
        ...(isAdmin ? {} : { filter: `user_id=eq.${user.id}` }),
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, isAdmin, load]);

  // ── Donut SVG ─────────────────────────────────────────────────
  const C    = 2 * Math.PI * 80;
  const total = metrics.recibido + metrics.dispersado || 1;
  const recPct  = metrics.recibido  / total;
  const dispPct = metrics.dispersado / total;
  const dispLen = dispPct * C;
  const recLen  = recPct  * C;

  // Texto del donut: muestra saldo (admin) o recibido (usuario)
  const donutVal = isAdmin ? saldoAnim : recAnim;
  const donutFmt = fmt(donutVal).replace(/\$|COP/g, "").trim();

  // ── Barra de recibido ─────────────────────────────────────────
  const recPctBar  = total > 1 ? recPct  * 100 : 0;
  const dispPctBar = total > 1 ? dispPct * 100 : 0;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* ── Panel principal: Donut + KPIs ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "260px 1fr",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "14px", overflow: "hidden", marginBottom: "16px",
      }}>

        {/* Donut */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", background: "var(--elevated)", borderRight: "1px solid var(--border)" }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "14px" }}>
            Flujo del mes
          </div>

          {loading ? (
            <div style={{ width: "200px", height: "200px", display: "grid", placeItems: "center", color: "var(--t3)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
              </svg>
            </div>
          ) : (
            <svg viewBox="0 0 220 220" width="200" height="200">
              {/* Track */}
              <circle cx="110" cy="110" r="80" fill="none" stroke="var(--elevated)" strokeWidth="22" />
              {/* Dispersado */}
              <circle cx="110" cy="110" r="80" fill="none" stroke="#e24b4a" strokeWidth="22"
                transform="rotate(-90 110 110)"
                strokeDasharray={`${dispLen} ${C - dispLen}`}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray .8s ease" }}
              />
              {/* Recibido */}
              <circle cx="110" cy="110" r="80" fill="none" stroke="#1d9e75" strokeWidth="22"
                transform="rotate(-90 110 110)"
                strokeDasharray={`${recLen} ${C - recLen}`}
                strokeDashoffset={-dispLen}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray .8s ease" }}
              />
              {/* Centro */}
              <text x="110" y="101" textAnchor="middle" fontSize="10" fill="var(--t3)"
                fontFamily="system-ui,sans-serif" fontWeight="600" letterSpacing="1">
                {isAdmin ? "SALDO" : "RECIBIDO"}
              </text>
              <text x="110" y="121" textAnchor="middle" fontSize="15" fontWeight="700"
                fill="var(--t1)" fontFamily="system-ui,sans-serif">
                {donutFmt.length > 9 ? donutFmt.slice(0, 9) : donutFmt}
              </text>
              <text x="110" y="136" textAnchor="middle" fontSize="10" fill="var(--t3)"
                fontFamily="system-ui,sans-serif">
                COP
              </text>
            </svg>
          )}

          <div style={{ display: "flex", gap: "18px", marginTop: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--t2)" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#1d9e75", flexShrink: 0 }} />
              Recibido
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--t2)" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#e24b4a", flexShrink: 0 }} />
              Dispersado
            </div>
          </div>
        </div>

        {/* KPIs apilados */}
        <div style={{ padding: "32px 36px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>

          {/* Saldo destacado */}
          <div>
            <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>
              {isAdmin ? "Saldo real · Bepay" : "Saldo disponible · COP"}
            </div>
            <div style={{ fontSize: "38px", fontWeight: 700, color: "var(--t1)", lineHeight: 1, marginBottom: "6px", letterSpacing: "-.5px", fontVariantNumeric: "tabular-nums" }}>
              {loading ? "—" : fmt(saldoAnim)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>
              {isAdmin ? "Balance en tiempo real · Bepay" : "Billetera activa · Bre-B · Ramplix"}
            </div>
          </div>

          <div style={{ height: "1px", background: "var(--border)", margin: "20px 0" }} />

          {/* Recibido */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0, background: "var(--success-dim)", color: "var(--success)", marginTop: "3px" }}>
              <i className="ti ti-arrow-down-right" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "6px" }}>
                Recibido este mes
              </div>
              <div style={{ fontSize: "22px", fontWeight: 600, lineHeight: 1, marginBottom: "8px", color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>
                {loading ? "—" : fmt(recAnim)}
              </div>
              <div style={{ height: "5px", background: "var(--elevated)", borderRadius: "3px", overflow: "hidden", marginBottom: "7px" }}>
                <div style={{ height: "100%", borderRadius: "3px", background: "#1d9e75", width: `${recPctBar}%`, transition: "width .6s ease" }} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                <b style={{ fontWeight: 600, color: "var(--t2)" }}>{metrics.recCount}</b> transacciones completadas
              </div>
            </div>
          </div>

          <div style={{ height: "1px", background: "var(--border)", margin: "20px 0" }} />

          {/* Dispersado */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0, background: "var(--error-dim)", color: "var(--error)", marginTop: "3px" }}>
              <i className="ti ti-arrow-up-right" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "6px" }}>
                Dispersado este mes
              </div>
              <div style={{ fontSize: "22px", fontWeight: 600, lineHeight: 1, marginBottom: "8px", color: "var(--error)", fontVariantNumeric: "tabular-nums" }}>
                {loading ? "—" : fmt(dispAnim)}
              </div>
              <div style={{ height: "5px", background: "var(--elevated)", borderRadius: "3px", overflow: "hidden", marginBottom: "7px" }}>
                <div style={{ height: "100%", borderRadius: "3px", background: "#e24b4a", width: `${dispPctBar}%`, transition: "width .6s ease" }} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                <b style={{ fontWeight: 600, color: "var(--t2)" }}>{metrics.dispCount}</b> dispersiones completadas
              </div>
            </div>
          </div>

          {metrics.congeladoCount > 0 ? (
            <>
              <div style={{ height: "1px", background: "var(--border)", margin: "20px 0" }} />

              {/* Congelado — dispersiones en PENDING: ya se descontaron del
                  saldo pero todavía no se confirman como completadas o
                  rechazadas. */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0, background: "var(--warning-dim)", color: "var(--warning)", marginTop: "3px" }}>
                  <i className="ti ti-clock-hour-4" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "6px" }}>
                    Congelado en dispersiones pendientes
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 600, lineHeight: 1, marginBottom: "8px", color: "var(--warning)", fontVariantNumeric: "tabular-nums" }}>
                    {loading ? "—" : fmt(metrics.congelado)}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                    <b style={{ fontWeight: 600, color: "var(--t2)" }}>{metrics.congeladoCount}</b> {metrics.congeladoCount === 1 ? "dispersión" : "dispersiones"} esperando confirmación de Bepay — ya se descontó del saldo, se reintegra si se rechaza
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Feed últimas transacciones ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Últimas transacciones</span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--t3)" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--success)", animation: "pulse 1.6s infinite" }} />
              En vivo
            </span>
          </div>
          <button
            onClick={load}
            style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t3)", fontSize: "12px", cursor: "pointer" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
              <path d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 12M19.418 15A8 8 0 014 12" strokeLinecap="round" />
            </svg>
            Actualizar
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
          </div>
        ) : feed.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)" }}>
            <i className="ti ti-arrows-exchange" style={{ fontSize: "32px", display: "block", marginBottom: "12px", opacity: .3 }} />
            <div style={{ fontWeight: 600, color: "var(--t2)", marginBottom: "6px" }}>Sin transacciones aún</div>
            <div style={{ fontSize: "12px" }}>Tus movimientos aparecerán aquí en tiempo real</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["Fecha", "Tipo", "Concepto", "De / Para", "Monto", "Comisión", "Estado"].map((h) => (
                    <th key={h} style={{ padding: "9px 16px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--t3)", borderBottom: "1px solid var(--border)", textAlign: h === "Monto" || h === "Comisión" ? "right" : "left" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feed.map((t) => {
                  const isCharge = t.type === "charge";
                  const statusColor = (t.status === "APPROVED" || t.status === "COMPLETED")
                    ? "var(--success)" : t.status === "PENDING"
                    ? "var(--warning)" : "var(--error)";
                  const statusBg = (t.status === "APPROVED" || t.status === "COMPLETED")
                    ? "var(--success-dim)" : t.status === "PENDING"
                    ? "var(--warning-dim)" : "var(--error-dim)";

                  return (
                    <tr key={t.id}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      style={{ borderBottom: "1px solid var(--border)", transition: ".1s" }}
                    >
                      <td style={{ padding: "12px 16px", color: "var(--t3)", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {new Date(t.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                        <div style={{ fontSize: "10px" }}>
                          {new Date(t.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 8px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, background: isCharge ? "var(--success-dim)" : "var(--error-dim)", color: isCharge ? "var(--success)" : "var(--error)" }}>
                          <i className={`ti ${isCharge ? "ti-arrow-down-right" : "ti-arrow-up-right"}`} style={{ fontSize: "12px" }} />
                          {isCharge ? "Cobro" : "Dispersión"}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--t1)", fontWeight: 500, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conceptLabel(t)}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--t1)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {counterpartyName(t) ?? "—"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isCharge ? "var(--success)" : "var(--error)" }}>
                        {isCharge ? "+" : "-"}{fmt(t.amount)}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--t3)", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                        {t.comision_total ? fmt(t.comision_total) : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 500, color: statusColor, background: statusBg }}>
                          {t.status === "APPROVED" || t.status === "COMPLETED" ? "Completado"
                            : t.status === "PENDING" ? "Pendiente"
                            : "Rechazado" /* FAILED, REJECTED, DECLINED, CANCELLED, etc. — mismo criterio que Estado de Cuenta / Mis billeteras */}
                        </span>
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