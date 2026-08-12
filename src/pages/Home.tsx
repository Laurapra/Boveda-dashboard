// src/pages/Home.tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { getBepayBalance, syncMyPayouts } from "../lib/bepayClient";
import type { ToastType } from "../types";
import "./Home.css";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

function useCountUp(target: number) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let cur = 0;
    const step = target / 55;
    const timer = setInterval(() => {
      cur += step;
      if (cur >= target) { setVal(target); clearInterval(timer); }
      else setVal(Math.round(cur));
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return val;
}

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

function counterpartyName(t: TxRow): string | null {
  return t.type === "charge" ? t.payer_name : t.ben_name;
}

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
  saldo: number;
  recibido: number;
  dispersado: number;
  recCount: number;
  dispCount: number;
  congelado: number;
  congeladoCount: number;
}

const EMPTY: Metrics = {
  saldo: 0, recibido: 0, dispersado: 0, recCount: 0, dispCount: 0, congelado: 0, congeladoCount: 0,
};

export const HomeView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const [metrics, setMetrics] = useState<Metrics>(EMPTY);
  const [feed, setFeed] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const saldoAnim = useCountUp(metrics.saldo);
  const recAnim = useCountUp(metrics.recibido);
  const dispAnim = useCountUp(metrics.dispersado);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (!isAdmin) {
        try { await syncMyPayouts(); } catch { /* no bloquea la carga */ }
      }

      let q = supabase
        .from("bepay_transactions")
        .select("id, type, amount, concept, status, ben_name, payer_name, account_type, payment_method, comision_total, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isAdmin) q = q.eq("user_id", user.id);
      const { data: txns } = await q;
      const rows = (txns ?? []) as TxRow[];

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

      const now = new Date();
      const delMes = rows.filter((t) => {
        const d = new Date(t.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const completadas = delMes.filter((t) => t.status === "APPROVED" || t.status === "COMPLETED");
      const recibidas = completadas.filter((t) => t.type === "charge");
      const dispersadas = completadas.filter((t) => t.type === "payout");
      const congeladas = rows.filter((t) => t.type === "payout" && t.status === "PENDING");

      setMetrics({
        saldo,
        recibido: recibidas.reduce((s, t) => s + t.amount, 0),
        dispersado: dispersadas.reduce((s, t) => s + t.amount, 0),
        recCount: recibidas.length,
        dispCount: dispersadas.length,
        congelado: congeladas.reduce((s, t) => s + t.amount + (t.comision_total ?? 0), 0),
        congeladoCount: congeladas.length,
      });

      setFeed(rows.slice(0, 8));
    } catch (err: any) {
      onToast("error", "Error", err.message);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

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

  const C = 2 * Math.PI * 68;
  const total = metrics.recibido + metrics.dispersado || 1;
  const recPct = metrics.recibido / total;
  const dispPct = metrics.dispersado / total;
  const dispLen = dispPct * C;
  const recLen = recPct * C;
  const donutVal = isAdmin ? saldoAnim : recAnim;
  const donutFmt = fmt(donutVal).replace(/\$|COP/g, "").trim();
  const recPctBar = total > 1 ? recPct * 100 : 0;
  const dispPctBar = total > 1 ? dispPct * 100 : 0;

  const statusPill = (status: string) => {
    if (status === "APPROVED" || status === "COMPLETED") return { cls: "pill pill--ok", label: "Completado" };
    if (status === "PENDING") return { cls: "pill pill--pending", label: "Pendiente" };
    return { cls: "pill pill--bad", label: "Rechazado" };
  };

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-flow">
          <div className="home-flow__chart">
            {loading ? (
              <div style={{ width: 160, height: 160, display: "grid", placeItems: "center", color: "var(--t3)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                </svg>
              </div>
            ) : (
              <svg viewBox="0 0 180 180" width="160" height="160" aria-label="Flujo del mes">
                <circle cx="90" cy="90" r="68" fill="none" stroke="var(--elevated)" strokeWidth="18" />
                <circle cx="90" cy="90" r="68" fill="none" stroke="var(--error)" strokeWidth="18"
                  transform="rotate(-90 90 90)" strokeDasharray={`${dispLen} ${C - dispLen}`} />
                <circle cx="90" cy="90" r="68" fill="none" stroke="var(--success)" strokeWidth="18"
                  transform="rotate(-90 90 90)" strokeDasharray={`${recLen} ${C - recLen}`} strokeDashoffset={-dispLen} />
                <text x="90" y="84" textAnchor="middle" fontSize="9" fill="var(--t3)" fontWeight="600">
                  {isAdmin ? "SALDO" : "RECIBIDO"}
                </text>
                <text x="90" y="102" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--t1)">
                  {donutFmt.length > 10 ? donutFmt.slice(0, 10) : donutFmt}
                </text>
              </svg>
            )}
          </div>
          <div className="home-flow__legend">
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Flujo del mes
            </div>
            <div className="home-flow__item">
              <span className="home-flow__dot home-flow__dot--in" />
              Recibido · {loading ? "—" : fmt(metrics.recibido)}
            </div>
            <div className="home-flow__item">
              <span className="home-flow__dot home-flow__dot--out" />
              Dispersado · {loading ? "—" : fmt(metrics.dispersado)}
            </div>
          </div>
        </div>

        <div className="home-saldo">
          <div className="home-saldo__label">
            {isAdmin ? "Saldo real · Bepay" : "Saldo disponible · COP"}
          </div>
          <div className="home-saldo__value">{loading ? "—" : fmt(saldoAnim)}</div>
          <div className="home-saldo__hint">
            {isAdmin ? "Balance en tiempo real · Bepay" : "Billetera activa · Bre-B · Ramplix"}
          </div>
        </div>

        <div className="home-kpis">
          <div className="home-kpi">
            <div className="home-kpi__top">
              <div className="home-kpi__icon home-kpi__icon--in"><i className="ti ti-arrow-down-right" /></div>
              <div className="home-kpi__label">Recibido este mes</div>
            </div>
            <div className="home-kpi__value home-kpi__value--in">{loading ? "—" : fmt(recAnim)}</div>
            <div className="home-kpi__bar">
              <div className="home-kpi__barFill home-kpi__barFill--in" style={{ width: `${recPctBar}%` }} />
            </div>
            <div className="home-kpi__meta"><b>{metrics.recCount}</b> cobros completados</div>
          </div>

          <div className="home-kpi">
            <div className="home-kpi__top">
              <div className="home-kpi__icon home-kpi__icon--out"><i className="ti ti-arrow-up-right" /></div>
              <div className="home-kpi__label">Dispersado este mes</div>
            </div>
            <div className="home-kpi__value home-kpi__value--out">{loading ? "—" : fmt(dispAnim)}</div>
            <div className="home-kpi__bar">
              <div className="home-kpi__barFill home-kpi__barFill--out" style={{ width: `${dispPctBar}%` }} />
            </div>
            <div className="home-kpi__meta"><b>{metrics.dispCount}</b> dispersiones completadas</div>
          </div>

          {metrics.congeladoCount > 0 && (
            <div className="home-kpi home-kpi--hold" style={{ gridColumn: "1 / -1" }}>
              <div className="home-kpi__top">
                <div className="home-kpi__icon home-kpi__icon--hold"><i className="ti ti-clock-hour-4" /></div>
                <div className="home-kpi__label">Congelado pendiente</div>
              </div>
              <div className="home-kpi__value home-kpi__value--hold">{loading ? "—" : fmt(metrics.congelado)}</div>
              <div className="home-kpi__meta">
                <b>{metrics.congeladoCount}</b> {metrics.congeladoCount === 1 ? "dispersión" : "dispersiones"} esperando confirmación
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="home-feed">
        <div className="home-feed__head">
          <div className="home-feed__titleWrap">
            <span className="home-feed__title">Últimas transacciones</span>
            <span className="home-feed__live">
              <span className="home-feed__liveDot" />
              En vivo
            </span>
          </div>
          <button type="button" className="home-feed__refresh" onClick={load}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
              <path d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 12M19.418 15A8 8 0 014 12" strokeLinecap="round" />
            </svg>
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="home-loading">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
          </div>
        ) : feed.length === 0 ? (
          <div className="home-empty">
            <i className="ti ti-arrows-exchange" style={{ fontSize: 32, opacity: 0.3 }} />
            <div className="home-empty__title">Sin transacciones aún</div>
            <div style={{ fontSize: 12 }}>Tus movimientos aparecerán aquí en tiempo real</div>
          </div>
        ) : (
          <>
            <div className="home-cards">
              {feed.map((t) => {
                const isCharge = t.type === "charge";
                const st = statusPill(t.status);
                return (
                  <article key={t.id} className="home-card">
                    <div className="home-card__row">
                      <div className="home-card__main">
                        <div className="home-card__concept">{conceptLabel(t)}</div>
                        <div className="home-card__party">{counterpartyName(t) ?? "—"}</div>
                      </div>
                      <div className="home-card__amount" style={{ color: isCharge ? "var(--success)" : "var(--error)" }}>
                        {isCharge ? "+" : "-"}{fmt(t.amount)}
                      </div>
                    </div>
                    <div className="home-card__meta">
                      <span className={isCharge ? "pill pill--in" : "pill pill--out"}>
                        <i className={`ti ${isCharge ? "ti-arrow-down-right" : "ti-arrow-up-right"}`} />
                        {isCharge ? "Cobro" : "Dispersión"}
                      </span>
                      <span className={st.cls}>{st.label}</span>
                      <span>
                        {new Date(t.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                        {" · "}
                        {new Date(t.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {t.comision_total ? <span>Comisión {fmt(t.comision_total)}</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="home-tableWrap">
              <table className="home-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Concepto</th>
                    <th>De / Para</th>
                    <th className="num">Monto</th>
                    <th className="num">Comisión</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.map((t) => {
                    const isCharge = t.type === "charge";
                    const st = statusPill(t.status);
                    return (
                      <tr key={t.id}>
                        <td style={{ color: "var(--t3)", fontSize: 12 }}>
                          {new Date(t.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                          <div style={{ fontSize: 10 }}>
                            {new Date(t.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td>
                          <span className={isCharge ? "pill pill--in" : "pill pill--out"}>
                            <i className={`ti ${isCharge ? "ti-arrow-down-right" : "ti-arrow-up-right"}`} />
                            {isCharge ? "Cobro" : "Dispersión"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{conceptLabel(t)}</td>
                        <td>{counterpartyName(t) ?? "—"}</td>
                        <td className="num" style={{ fontWeight: 700, color: isCharge ? "var(--success)" : "var(--error)" }}>
                          {isCharge ? "+" : "-"}{fmt(t.amount)}
                        </td>
                        <td className="num" style={{ color: "var(--t3)", fontSize: 12 }}>
                          {t.comision_total ? fmt(t.comision_total) : "—"}
                        </td>
                        <td><span className={st.cls}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
