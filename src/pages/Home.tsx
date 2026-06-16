import React, { useState, useEffect } from "react";
import type { ToastType } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

const METHODS = [
  { k: "Bre-B",  bg: "#0E3A53", color: "#7DD3FC" },
  { k: "Nequi",  bg: "#5B2A86", color: "#E9D5FF" },
  { k: "Link",   bg: "#1F2937", color: "#C7D2FE" },
];
const PAYERS = [
  "Juan P***** G*****", "María L***** R*****",
  "Andrés C***** M*****", "Valentina O***** D*****",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function refCode() {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "BRB-" + Array.from({ length: 6 }, () => s[Math.floor(Math.random() * s.length)]).join("");
}

// Animación de conteo desde 0 hasta el valor objetivo
function useCountUp(target: number) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let current = 0;
    const step = target / 55;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { setVal(target); clearInterval(timer); }
      else setVal(Math.round(current));
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return val;
}

interface FeedRow {
  id: string;
  method: typeof METHODS[0];
  payer: string;
  amount: number;
  ref: string;
  isNew: boolean;
}

export const HomeView: React.FC<Props> = ({ fmt }) => {
  // Contadores animados para los KPIs
  const tpv    = useCountUp(1284500000);
  const avail  = useCountUp(84320000);
  const frozen = useCountUp(22910000);

  // Feed en vivo: empieza con 5 filas, agrega una nueva cada 4.2s
  const [feed, setFeed] = useState<FeedRow[]>(() =>
    Array.from({ length: 5 }, () => ({
      id: crypto.randomUUID(),
      method: pick(METHODS),
      payer: pick(PAYERS),
      amount: pick([80000, 150000, 200000, 350000, 650000]),
      ref: refCode(),
      isNew: false,
    }))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setFeed((prev) => [
        { id: crypto.randomUUID(), method: pick(METHODS), payer: pick(PAYERS), amount: pick([80000, 150000, 200000, 350000, 650000]), ref: refCode(), isNew: true },
        ...prev,
      ].slice(0, 9)); // máximo 9 filas visibles
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  const kpis = [
    { label: "Volumen procesado (TPV)", value: fmt(tpv),       delta: "+18.4%", up: true,  sub: "vs. mes anterior" },
    { label: "Tasa de éxito",           value: "97.3%",        delta: "+1.2%",  up: true,  sub: "3.842 transacciones" },
    { label: "Saldo disponible",        value: fmt(avail),     delta: null,     up: null,  sub: "listo para dispersar" },
    { label: "Retenido / Garantía",     value: fmt(frozen),    delta: "10%",    up: null,  sub: "libera 11 jun" },
  ];

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Encabezado de página */}
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px" }}>Vista General</h1>
        <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>
          Resumen de tu operación · últimos 30 días
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px", marginBottom: "18px" }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "17px 18px", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: "12.5px", color: "var(--t2)", marginBottom: "11px" }}>{k.label}</div>
            <div style={{ fontSize: "25px", fontWeight: 700, letterSpacing: "-.6px", fontVariantNumeric: "tabular-nums" }}>
              {k.value}
            </div>
            <div style={{ marginTop: "9px", fontSize: "12px", display: "flex", alignItems: "center", gap: "7px" }}>
              {k.delta && (
                <span style={{
                  padding: "2px 6px", borderRadius: "6px", fontWeight: 600,
                  color: k.up === true ? "var(--success)" : "var(--t2)",
                  background: k.up === true ? "var(--success-dim)" : "var(--elevated)",
                }}>
                  {k.delta}
                </span>
              )}
              <span style={{ color: "var(--t3)" }}>{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Flujo de fondos + Feed en vivo */}
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: "16px", marginBottom: "18px" }}>

        {/* Flujo de fondos */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "14.5px", fontWeight: 600 }}>Flujo de fondos</h3>
            <span style={{ fontSize: "12px", color: "var(--t3)" }}>Congelado → Disponible · T+1</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "8px", padding: "20px" }}>
            {/* Panel izquierdo: saldo congelado */}
            <div style={{ padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--elevated)" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t2)", marginBottom: "9px", display: "flex", alignItems: "center", gap: "7px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--info)" }} />
                Saldo congelado
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(22910000)}</div>
              <div style={{ fontSize: "11.5px", color: "var(--t3)", marginTop: "6px" }}>142 recaudos en clearing</div>
            </div>

            {/* Flecha central */}
            <div style={{ color: "var(--t3)", fontSize: "20px", padding: "0 4px" }}>→</div>

            {/* Panel derecho: saldo disponible */}
            <div style={{ padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid color-mix(in srgb, var(--success) 40%, var(--border))", background: "var(--elevated)" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--t2)", marginBottom: "9px", display: "flex", alignItems: "center", gap: "7px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)" }} />
                Saldo disponible
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>{fmt(84320000)}</div>
              <div style={{ fontSize: "11.5px", color: "var(--t3)", marginTop: "6px" }}>listo para dispersar</div>
            </div>
          </div>

          {/* Barra de progreso y notas */}
          <div style={{ padding: "0 20px 18px" }}>
            <div style={{ height: "7px", borderRadius: "6px", background: "var(--elevated)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: "78%", borderRadius: "6px", background: "linear-gradient(90deg, var(--info), var(--success))" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "9px", fontSize: "11.5px", color: "var(--t3)" }}>
              <span>Próxima liberación: <b style={{ color: "var(--t2)" }}>{fmt(8240000)}</b> · mañana 06:00</span>
              <span>Rolling reserve: <b style={{ color: "var(--t2)" }}>{fmt(9130000)}</b></span>
            </div>
          </div>
        </div>

        {/* Feed en vivo */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "14.5px", fontWeight: 600 }}>Confirmaciones en vivo</h3>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--t3)" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--success)", animation: "pulse 1.6s infinite" }} />
              Tiempo real
            </span>
          </div>
          <div style={{ padding: "6px 6px 10px", maxHeight: "260px", overflowY: "auto" }}>
            {feed.map((row) => (
              <div key={row.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 12px", borderRadius: "var(--radius-sm)", animation: row.isNew ? "pop .5s ease" : undefined }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "9px", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "13px", background: row.method.bg, color: row.method.color, flexShrink: 0 }}>
                  {row.method.k[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{row.payer}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--t3)", fontFamily: "var(--mono)" }}>{row.ref}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <b style={{ fontSize: "13.5px", color: "var(--success)", display: "block", fontVariantNumeric: "tabular-nums" }}>+{fmt(row.amount)}</b>
                  <span style={{ fontSize: "11px", color: "var(--t3)" }}>hace instantes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Embudo de conversión */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: "14.5px", fontWeight: 600 }}>Embudo de conversión</h3>
          <span style={{ fontSize: "12px", color: "var(--t3)" }}>Creado → Pendiente → Pagado</span>
        </div>
        <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {[
            { count: 4012, label: "Links creados",          pct: 100,  drop: null },
            { count: 3901, label: "Pago iniciado",          pct: 97.2, drop: "−2.8%" },
            { count: 3842, label: "Pagado y conciliado",    pct: 95.8, drop: "−1.5%" },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <b style={{ fontVariantNumeric: "tabular-nums" }}>{row.count.toLocaleString("es-CO")}</b>
                <span style={{ color: "var(--t2)" }}>{row.label}</span>
              </div>
              <div style={{ height: "9px", borderRadius: "6px", background: "var(--elevated)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${row.pct}%`, background: "linear-gradient(90deg, var(--accent), #7c5cff)", borderRadius: "6px" }} />
              </div>
              {row.drop && <span style={{ fontSize: "11px", color: "var(--t3)", alignSelf: "flex-end" }}>{row.drop}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};