// src/components/ui/Modal.tsx
import React, { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, title, subtitle, children, footer, maxWidth = 540,
}) => {
  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Bloquear scroll del body mientras el modal está abierto
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(5,7,12,.7)",
        backdropFilter: "blur(4px)",
        zIndex: 80,
        display: "flex", alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 20px",
        overflowY: "auto",
        animation: "fadeUp .2s ease",
      }}
    >
      <div style={{
        width: "100%", maxWidth,
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 30px 80px -20px rgba(0,0,0,.7)",
        animation: "fadeUp .26s cubic-bezier(.2,.8,.2,1)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 22px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "-.3px" }}>{title}</h2>
            {subtitle && <p style={{ fontSize: "12.5px", color: "var(--t3)", marginTop: "2px" }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            style={{ width: "32px", height: "32px", borderRadius: "8px", display: "grid", placeItems: "center", color: "var(--t3)", border: "none", background: "none", cursor: "pointer", flexShrink: 0 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "16px 22px", borderTop: "1px solid var(--border)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};