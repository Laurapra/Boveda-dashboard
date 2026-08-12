// src/components/layout/Sidebar.tsx
import React from "react";
import { useAuthStore } from "../../store/authStore";
import Logo from "../../assets/Logo.png";

export type ViewKey =
  | "home"
  | "billeteras"
  | "movimientos"
  | "cuenta"
  | "cuentas"
  | "tarifas"
  | "reportes"
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

// ✅ Restaurado: genera el SVG único de cada ítem, usando el path que recibe
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
    key: "cuentas", label: "Beneficiarios",
    icon: Ico(<><circle cx="9" cy="7" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" /><path d="M16 11c1.7 0 3 1.3 3 3s-1.3 3-3 3" strokeLinecap="round" /><path d="M19 20c1.7-.5 3-2 3-4" strokeLinecap="round" /></>),
  },
  {
    key: "cuenta", label: "Estado de Cuenta", section: "Cuenta",
    icon: Ico(<><path d="M4 5h16v14H4z" /><path d="M4 9h16M8 13h5" strokeLinecap="round" /></>),
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
    key: "onboarding", label: "Onboarding",
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
    <>
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src={Logo} alt="Logo" />
        </div>
        <div className="sidebar-brand">
          <div className="sidebar-brand-title">RAMPLIX</div>
          <div className="sidebar-brand-subtitle">Portal · Ramplix</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV.filter((item) => item.key !== "admin" || user?.role === "admin").map((item) => {
          const isActive = active === item.key;
          return (
            <React.Fragment key={item.key}>
              {item.section && (
                <div className="sidebar-section">
                  {item.section}
                </div>
              )}
              <button
                className={`sidebar-item ${isActive ? "active" : ""}`}
                onClick={() => onNav(item.key)}
              >
                <span className="sidebar-item-icon">{item.icon}</span>
                <span className="sidebar-item-label">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="sidebar-item-badge">{item.badge}</span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <button
          className="sidebar-theme-btn"
          onClick={onToggleTheme}
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

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.full_name ?? "Usuario"}</div>
            <div className="sidebar-user-role">{user?.role}</div>
          </div>
          <button
            className="sidebar-logout-btn"
            onClick={signOut}
            title="Cerrar sesión"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
};