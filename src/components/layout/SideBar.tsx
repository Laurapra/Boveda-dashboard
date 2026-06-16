import React from "react";
import { useAuthStore } from "../../store/authStore";

type ViewKey = "home" | "recaudo" | "dispersion" | "cuenta";

interface Props {
  active: ViewKey;
  onNav: (v: ViewKey) => void;
}

const NAV = [
  { key: "home"       as ViewKey, label: "Vista General",    badge: null },
  { key: "recaudo"    as ViewKey, label: "Recaudo",          badge: 24   },
  { key: "dispersion" as ViewKey, label: "Dispersión",       badge: null },
  { key: "cuenta"     as ViewKey, label: "Estado de Cuenta", badge: null },
];

export const Sidebar: React.FC<Props> = ({ active, onNav }) => {
  const { user, signOut } = useAuthStore();

  // Genera las iniciales del nombre para el avatar (ej: "Carlos Mendoza" → "CM")
  const initials = user?.full_name
    ?.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() ?? "??";

  return (
    <aside style={{ width: "248px", background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, flexShrink: 0 }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "20px 20px 18px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "linear-gradient(140deg, var(--accent), #7c5cff)", display: "grid", placeItems: "center", flexShrink: 0, boxShadow: "0 4px 14px -4px var(--accent-ring)" }}>
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M12 2L3 6.5v6c0 5 3.9 8.4 9 9.5 5.1-1.1 9-4.5 9-9.5v-6L12 2z" fill="#fff" opacity=".95" />
            <path d="M9 12l2 2 4-4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "16px" }}>Bóveda</div>
          <div style={{ fontSize: "10.5px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600 }}>Payment Gateway</div>
        </div>
      </div>

      {/* Navegación */}
      <nav style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
        <div style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--t3)", padding: "14px 12px 6px" }}>
          Operación
        </div>
        {NAV.map((item) => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: "11px",
                padding: "9px 12px", borderRadius: "var(--radius-sm)",
                color: isActive ? "var(--accent)" : "var(--t2)",
                background: isActive ? "var(--accent-dim)" : "transparent",
                fontWeight: 500, fontSize: "13.5px", border: "none",
                cursor: "pointer", width: "100%", textAlign: "left",
                position: "relative", transition: ".14s",
              }}
            >
              {/* Barra lateral activa */}
              {isActive && (
                <span style={{ position: "absolute", left: "-12px", top: "50%", transform: "translateY(-50%)", width: "3px", height: "18px", background: "var(--accent)", borderRadius: "0 3px 3px 0" }} />
              )}
              {item.label}
              {item.badge && (
                <span style={{ marginLeft: "auto", background: "var(--accent)", color: "#fff", fontSize: "10.5px", fontWeight: 700, minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "9px", display: "grid", placeItems: "center" }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Usuario + botón de logout */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px", borderRadius: "var(--radius-sm)" }}>
          {/* Avatar con iniciales */}
          <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "linear-gradient(135deg, #2dd4bf, var(--accent))", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "12px", color: "#fff", flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.full_name ?? "Usuario"}
            </div>
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>{user?.role}</div>
          </div>
          {/* Botón logout */}
          <button onClick={signOut} title="Cerrar sesión" style={{ width: "28px", height: "28px", borderRadius: "7px", display: "grid", placeItems: "center", color: "var(--t3)", border: "1px solid var(--border)", background: "none", cursor: "pointer", flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
};