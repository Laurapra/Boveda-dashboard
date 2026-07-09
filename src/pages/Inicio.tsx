// src/pages/Inicio.tsx
import React, { useEffect, useState } from "react";

interface Props {
  fmt: (n: number) => string;
}

// Datos mock — reemplaza con Supabase cuando tengas datos reales
const MOCK = {
  balance:    84320000,
  recibido:   128450000,
  dispersado: 44130000,
  recCount:   42,
  dispCount:  18,
};

function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let cur = 0;
    const step = target / 50;
    const t = setInterval(() => {
      cur += step;
      if (cur >= target) { setVal(target); clearInterval(t); }
      else setVal(Math.round(cur));
    }, duration / 50);
    return () => clearInterval(t);
  }, [target]);
  return val;
}

export const InicioView: React.FC<Props> = ({ fmt }) => {
  const balance    = useCountUp(MOCK.balance);
  const recibido   = useCountUp(MOCK.recibido);
  const dispersado = useCountUp(MOCK.dispersado);

  // Calcular arcos del donut
  const C = 2 * Math.PI * 80; // circunferencia r=80
  const total = MOCK.recibido + MOCK.dispersado || 1;
  const recPct  = MOCK.recibido / total;
  const dispPct = MOCK.dispersado / total;
  const recLen  = recPct  * C;
  const dispLen = dispPct * C;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        background: "var(--surface-2)",
        border: ".5px solid var(--border)",
        borderRadius: "14px",
        overflow: "hidden",
        marginBottom: "16px",
      }}>
        {/* Donut */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", background: "var(--surface-1)", borderRight: ".5px solid var(--border)" }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "14px" }}>
            Flujo del mes
          </div>
          <div style={{ position: "relative", width: "200px", height: "200px" }}>
            <svg viewBox="0 0 220 220" width="200" height="200">
              {/* Track */}
              <circle cx="110" cy="110" r="80" fill="none" stroke="#f1efe9" strokeWidth="22" />
              {/* Dispersado */}
              <circle cx="110" cy="110" r="80" fill="none" stroke="#e24b4a" strokeWidth="22"
                transform="rotate(-90 110 110)"
                strokeDasharray={`${dispLen} ${C - dispLen}`}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray 1s ease" }}
              />
              {/* Recibido */}
              <circle cx="110" cy="110" r="80" fill="none" stroke="#1d9e75" strokeWidth="22"
                transform="rotate(-90 110 110)"
                strokeDasharray={`${recLen} ${C - recLen}`}
                strokeDashoffset={-dispLen}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray 1s ease" }}
              />
              <text x="110" y="101" textAnchor="middle" fontSize="10" fill="#8a8981" fontFamily="system-ui,sans-serif" fontWeight="600" letterSpacing="1">SALDO</text>
              <text x="110" y="120" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1a1a18" fontFamily="system-ui,sans-serif">
                {fmt(balance).replace("COP", "").trim()}
              </text>
              <text x="110" y="135" textAnchor="middle" fontSize="10" fill="#8a8981" fontFamily="system-ui,sans-serif">COP</text>
            </svg>
          </div>
          <div style={{ display: "flex", gap: "18px", marginTop: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-muted)" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#1d9e75", flexShrink: 0 }} />
              Recibido
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-muted)" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#e24b4a", flexShrink: 0 }} />
              Dispersado
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ padding: "32px 36px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          {/* Saldo */}
          <div>
            <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>
              Saldo disponible · COP
            </div>
            <div style={{ fontSize: "38px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1, marginBottom: "6px", letterSpacing: "-.5px", fontVariantNumeric: "tabular-nums" }}>
              {fmt(balance)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Billetera activa · Bre-B · Ramplix</div>
          </div>

          <div style={{ height: ".5px", background: "var(--border)", margin: "20px 0" }} />

          {/* Recibido */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0, background: "var(--bg-success)", color: "var(--text-success)" }}>
              <i className="ti ti-arrow-down-right" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "6px" }}>
                Recibido este mes
              </div>
              <div style={{ fontSize: "22px", fontWeight: 600, lineHeight: 1, marginBottom: "8px", color: "var(--text-success)", fontVariantNumeric: "tabular-nums" }}>
                {fmt(recibido)}
              </div>
              <div style={{ height: "5px", background: "var(--surface-1)", borderRadius: "3px", overflow: "hidden", marginBottom: "7px" }}>
                <div style={{ height: "100%", borderRadius: "3px", background: "var(--fill-success)", width: `${recPct * 100}%`, transition: "width .5s ease" }} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                <b style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{MOCK.recCount}</b> transacciones completadas
              </div>
            </div>
          </div>

          <div style={{ height: ".5px", background: "var(--border)", margin: "20px 0" }} />

          {/* Dispersado */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0, background: "var(--bg-danger)", color: "var(--text-danger)" }}>
              <i className="ti ti-arrow-up-right" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "6px" }}>
                Dispersado este mes
              </div>
              <div style={{ fontSize: "22px", fontWeight: 600, lineHeight: 1, marginBottom: "8px", color: "var(--text-danger)", fontVariantNumeric: "tabular-nums" }}>
                {fmt(dispersado)}
              </div>
              <div style={{ height: "5px", background: "var(--surface-1)", borderRadius: "3px", overflow: "hidden", marginBottom: "7px" }}>
                <div style={{ height: "100%", borderRadius: "3px", background: "var(--fill-danger)", width: `${dispPct * 100}%`, transition: "width .5s ease" }} />
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                <b style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{MOCK.dispCount}</b> dispersiones completadas
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};