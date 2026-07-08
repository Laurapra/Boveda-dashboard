// src/components/ui/StatusBadge.tsx
import React from "react";

const CONFIG: Record<string, { color: string; bg: string }> = {
  Completado: { color: "var(--success)",  bg: "var(--success-dim)" },
  Pendiente:  { color: "var(--warning)",  bg: "var(--warning-dim)" },
  Rechazado:  { color: "var(--error)",    bg: "var(--error-dim)" },
  Fallido:    { color: "var(--error)",    bg: "var(--error-dim)" },
  Recibido:   { color: "var(--success)",  bg: "var(--success-dim)" },
  Enviado:    { color: "var(--t2)",       bg: "var(--elevated)" },
  "Bre-B":    { color: "var(--accent)",   bg: "var(--accent-dim)" },
  Activa:     { color: "var(--success)",  bg: "var(--success-dim)" },
  Inactiva:   { color: "var(--error)",    bg: "var(--error-dim)" },
  Ahorros:    { color: "var(--t2)",       bg: "var(--elevated)" },
  Corriente:  { color: "var(--t2)",       bg: "var(--elevated)" },
};

export const StatusBadge: React.FC<{ value: string }> = ({ value }) => {
  const c = CONFIG[value] ?? { color: "var(--t3)", bg: "var(--elevated)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 8px", borderRadius: "20px",
      fontSize: "11px", fontWeight: 500,
      color: c.color, background: c.bg,
    }}>
      {value}
    </span>
  );
};