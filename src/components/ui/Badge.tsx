// src/components/ui/Badge.tsx
import React from "react";
import type { TxStatus } from "../../types";

// Todos los estados posibles con sus colores
type Variant = TxStatus | "in" | "out";

const CONFIG: Record<Variant, { label: string; color: string; bg: string }> = {
  paid:    { label: "Pagado",    color: "var(--success)", bg: "var(--success-dim)" },
  frozen:  { label: "Congelado", color: "var(--info)",    bg: "var(--info-dim)" },
  pending: { label: "Pendiente", color: "var(--warning)", bg: "var(--warning-dim)" },
  failed:  { label: "Fallido",   color: "var(--error)",   bg: "var(--error-dim)" },
  held:    { label: "Retenido",  color: "#c084fc",        bg: "rgba(192,132,252,.12)" },
  in:      { label: "Abono",     color: "var(--success)", bg: "var(--success-dim)" },
  out:     { label: "Cargo",     color: "var(--info)",    bg: "var(--info-dim)" },
};

interface BadgeProps {
  variant: Variant;
  label?: string; // opcional: sobreescribe el label por defecto
}

export const Badge: React.FC<BadgeProps> = ({ variant, label }) => {
  const cfg = CONFIG[variant];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 9px", borderRadius: "7px",
      fontSize: "11.5px", fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {label ?? cfg.label}
    </span>
  );
};