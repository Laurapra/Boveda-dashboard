// src/components/layout/Sidebar.tsx
import React from "react";
import { useAuthStore } from "../../store/authStore";

export type ViewKey =
  | "home"
  | "billeteras"
  | "movimientos"
  | "beneficiarios"
  | "cuenta"
  | "cuentas-bancarias"
  | "tarifas"
  | "reportes"
  | "kyc"
  | "admin"
  | "onboarding";

interface Props {
  active: ViewKey;
  onNav: (v: ViewKey) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

interface NavItem {
  key: ViewKey;
  label: string;
  badge?: number | string;
  section?: string;
  icon: React.ReactNode;
}

const Ico = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    width="17" height="17" style={{ flexShrink: 0 }}>
    {path}
  </svg>
);

const NAV: NavItem[] = [
  {
    key: "home", label: "Inicio", section: "Principal",
    icon: Ico(<path d="M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" strokeLinecap="round" strokeLinejoin="round" />),
  },
  {
    key: "billeteras", label: "Mis billeteras",
    icon: Ico(<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" /><circle cx="16" cy="14" r="1" fill="currentColor" /></>),
  },
  {
    key: "movimientos", label: "Movimientos", section: "Operaciones",
    icon: Ico(<path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" strokeLinecap="round" strokeLinejoin="round" />),
  },
  {
    key: "beneficiarios", label: "Beneficiarios",
    icon: Ico(<><circle cx="9" cy="7" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" /><path d="M16 11c1.7 0 3 1.3 3 3s-1.3 3-3 3" strokeLinecap="round" /><path d="M19 20c1.7-.5 3-2 3-4" strokeLinecap="round" /></>),
  },
  {
    key: "cuenta", label: "Estado de Cuenta", section: "Cuenta",
    icon: Ico(<><path d="M4 5h16v14H4z" /><path d="M4 9h16M8 13h5" strokeLinecap="round" /></>),
  },
  {
    key: "cuentas-bancarias", label: "Cuentas Bancarias",
    icon: Ico(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" strokeLinecap="round" /></>),
  },
  {
    key: "tarifas", label: "Mis tarifas",
    icon: Ico(<><path d="M4 4h16v4H4zM4 12h16v4H4z" /><path d="M4 8v4M20 8v4" strokeLinecap="round" /></>),
  },
  {
    key: "reportes", label: "Reportes",
    icon: Ico(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" strokeLinecap="round" /></>),
  },
  {
    key: "kyc", label: "Verificación KYC",
    icon: Ico(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></>),
  },
  {
    key: "onboarding", label: "Onboarding Bre-B", badge: "!",
    icon: Ico(<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" strokeLinecap="round" strokeLinejoin="round" />),
  },
  {
    key: "admin", label: "Panel Admin", section: "Administración",
    icon: Ico(<><circle cx="12" cy="8" r="3" /><path d="M3 20c0-4 4-7 9-7s9 3 9 7" strokeLinecap="round" /><path d="M16 3.13a4 4 0 010 7.75" strokeLinecap="round" /></>),
  }
];

export const Sidebar: React.FC<Props> = ({ active, onNav, theme, onToggleTheme }) => {
  const { user, signOut } = useAuthStore();

  const initials = user?.full_name
    ?.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() ?? "??";

  return (
    <aside style={{
      width: "248px", flexShrink: 0,
      background: "var(--surface)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0,
    }}>

      {/* ── Logo ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "20px 20px 18px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "linear-gradient(140deg, var(--accent), #7c5cff)", display: "grid", placeItems: "center", flexShrink: 0, boxShadow: "0 4px 14px -4px var(--accent-ring)" }}>
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M12 2L3 6.5v6c0 5 3.9 8.4 9 9.5 5.1-1.1 9-4.5 9-9.5v-6L12 2z" fill="#fff" opacity=".95" />
            <path d="M9 12l2 2 4-4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "-.2px" }}>Global Coin SAS</div>
          <div style={{ fontSize: "10.5px", color: "var(--t3)", letterSpacing: ".3px" }}>Portal · Ramplix</div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 10px 0" }}>
        {NAV.filter((item) => item.key !== "admin" || user?.role === "admin").map((item) => {
          const isActive = active === item.key;
          return (
            <React.Fragment key={item.key}>
              {item.section && (
                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", padding: "14px 10px 4px", letterSpacing: ".07em", textTransform: "uppercase" }}>
                  {item.section}
                </div>
              )}
              <button
                onClick={() => onNav(item.key)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 10px", width: "100%",
                  border: "none", cursor: "pointer",
                  fontSize: "13px", textAlign: "left",
                  borderRadius: "var(--radius-sm)",
                  transition: "background .1s, color .1s",
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--t2)",
                  fontWeight: isActive ? 500 : 400,
                  position: "relative",
                  marginBottom: "1px",
                }}
              >
                {isActive && (
                  <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: "3px", height: "18px", background: "var(--accent)", borderRadius: "0 3px 3px 0" }} />
                )}
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge !== undefined && (
                  <span style={{ background: "var(--accent)", color: "#fff", borderRadius: "20px", fontSize: "10px", padding: "1px 7px", fontWeight: 700 }}>
                    {item.badge}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px" }}>
        {/* Toggle tema */}
        <button
          onClick={onToggleTheme}
          style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--elevated)", color: "var(--t2)", fontSize: "12.5px", fontWeight: 500, marginBottom: "8px", cursor: "pointer", transition: ".14s" }}
        >
          {theme === "dark" ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" />
              </svg>
              Modo claro
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" strokeLinejoin="round" />
              </svg>
              Modo oscuro
            </>
          )}
        </button>

        {/* Usuario */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px", borderRadius: "var(--radius-sm)" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "linear-gradient(135deg, #2dd4bf, var(--accent))", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "12px", color: "#fff", flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.full_name ?? "Usuario"}
            </div>
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>{user?.role}</div>
          </div>
          <button
            onClick={signOut}
            title="Cerrar sesión"
            style={{ width: "28px", height: "28px", borderRadius: "7px", display: "grid", placeItems: "center", color: "var(--t3)", border: "1px solid var(--border)", background: "none", cursor: "pointer", flexShrink: 0 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
};