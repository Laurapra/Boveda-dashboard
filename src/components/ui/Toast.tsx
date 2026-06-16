// src/components/ui/Toast.tsx
import React from "react";
import type { ToastItem } from "../../types";

// Íconos SVG por tipo de toast
const ICONS = {
  ok:    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  info:  <><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  error: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
};

const COLORS = {
  ok:    { bg: "var(--success-dim)", color: "var(--success)" },
  info:  { bg: "var(--info-dim)",    color: "var(--info)" },
  error: { bg: "var(--error-dim)",   color: "var(--error)" },
};

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => (
  <div style={{ position: "fixed", bottom: "22px", right: "22px", zIndex: 120, display: "flex", flexDirection: "column", gap: "10px" }}>
    {toasts.map((t) => (
      <div
        key={t.id}
        onClick={() => onRemove(t.id)} // clic para cerrar
        style={{
          display: "flex", alignItems: "center", gap: "11px",
          padding: "13px 16px",
          background: "var(--elevated)", border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
          minWidth: "280px", cursor: "pointer",
          animation: "slideIn .3s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div style={{ width: "30px", height: "30px", borderRadius: "8px", display: "grid", placeItems: "center", flexShrink: 0, background: COLORS[t.type].bg, color: COLORS[t.type].color }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">{ICONS[t.type]}</svg>
        </div>
        <div>
          <b style={{ fontSize: "13px", display: "block" }}>{t.title}</b>
          <span style={{ fontSize: "12px", color: "var(--t2)" }}>{t.message}</span>
        </div>
      </div>
    ))}
  </div>
);