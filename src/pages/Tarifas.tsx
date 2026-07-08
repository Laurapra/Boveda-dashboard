// src/pages/Tarifas.tsx
import React from "react";

const TARIFAS = { CARGO_FIJO: 1190, VARIABLE_PCT: 0.0012 };

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export const TarifasView: React.FC = () => (
  <div style={{ animation: "fadeUp .3s ease" }}>
    <div style={{ background: "var(--surface-2)", border: ".5px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "12px" }}>
      <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "16px" }}>
        Operaciones en Pesos colombianos · COP
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* Por recibir */}
        <div style={{ padding: "20px 22px", borderRight: ".5px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "var(--bg-success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-download" style={{ fontSize: "14px", color: "var(--text-success)" }} />
            </div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>Por recibir</span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
            {fmt(TARIFAS.CARGO_FIJO)}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Fijo por transacción</div>
        </div>

        {/* Por enviar */}
        <div style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "var(--bg-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-upload" style={{ fontSize: "14px", color: "var(--text-accent)" }} />
            </div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>Por enviar</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
            <span style={{ fontSize: "28px", fontWeight: 600, color: "var(--text-primary)" }}>{fmt(TARIFAS.CARGO_FIJO)}</span>
            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-muted)" }}>
              + {(TARIFAS.VARIABLE_PCT * 100).toFixed(2).replace(".", ",")}%
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Fijo + porcentaje sobre el monto</div>
        </div>
      </div>
    </div>

    {/* Próximas divisas */}
    <div style={{ background: "var(--surface-2)", border: ".5px solid var(--border)", borderRadius: "12px", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>
            Próximamente disponible
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {["USD", "EUR", "BRL", "MXN"].map((d) => (
              <span key={d} style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--surface-1)", border: ".5px solid var(--border)", borderRadius: "var(--radius)", padding: "3px 10px" }}>
                {d}
              </span>
            ))}
          </div>
        </div>
        <button style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "var(--radius)", fontSize: "13px", cursor: "pointer", border: ".5px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--text-primary)" }}>
          <i className="ti ti-message" />
          Consultar tarifas
        </button>
      </div>
    </div>
  </div>
);