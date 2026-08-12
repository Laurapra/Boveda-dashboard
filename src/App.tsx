// src/App.tsx
import { useState, useEffect } from "react";
import "./index.css";

import { useAuthStore } from "./store/authStore";
import { Login }    from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";
import { ToastContainer } from "./components/ui/Toast";
import { useToast } from "./hooks/useToast";

import { Sidebar, type ViewKey } from "./components/layout/SideBar";

// Páginas existentes
import { HomeView }         from "./pages/Home";
import { EstadoCuentaView } from "./pages/EstadoCuenta";
import { OnboardingView }   from "./pages/Onboarding";
import { CuentasView }      from "./pages/Cuentas";

// Páginas nuevas
import { BilleterasView }    from "./pages/Billeteras";
import { MovimientosView }   from "./pages/Movimientos";
import { TarifasView }       from "./pages/Tarifas";
import { ReportesView }      from "./pages/Reportes";
import { AdminView }         from "./pages/Admin";
import { SeguridadView }     from "./pages/Seguridad";

// Modal de creación de links/QR
import { CreateLinkModal } from "./components/CreateLinkModal";



const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});

const PAGE_INFO: Record<ViewKey, { title: string; sub: string }> = {
  home:        { title: "Inicio",              sub: "Bienvenido al portal Ramplix" },
  billeteras:  { title: "Mis billeteras",       sub: "Gestiona tus cuentas en diferentes divisas" },
  movimientos: { title: "Dispersar",            sub: "Historial de dispersiones realizadas" },
  cuentas:     { title: "Beneficiarios",        sub: "Gestiona los beneficiarios de tus dispersiones" },
  cuenta:      { title: "Estado de Cuenta",     sub: "Movimientos, comisiones y reportes financieros" },
  tarifas:     { title: "Mis tarifas",          sub: "Comisiones y costos por operación" },
  reportes:    { title: "Reportes",             sub: "Descarga reportes en PDF o XML" },
  onboarding:  { title: "Onboarding",           sub: "Registro único de tu comercio" },
  admin:       { title: "Panel de Administración", sub: "Gestiona usuarios y tarifas" },
  seguridad:   { title: "Seguridad",            sub: "Verificación en dos pasos (2FA)" },
};

export default function App() {
  const { user, session, loading, loadSession, signOut } = useAuthStore();
  const [view, setView]             = useState<ViewKey>("home");
  const [theme, setTheme]           = useState<"dark" | "light">("dark");
  const { toasts, addToast, removeToast } = useToast();
  const [createLinkOpen, setCreateLinkOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { loadSession(); }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    setMenuOpen(false);
  }, [view]);

  const toggleTheme = () => setTheme((t) => t === "dark" ? "light" : "dark");
  const fmt = COP.format.bind(COP);

  // ── Recuperación de contraseña ──
  // Supabase redirige aquí con una sesión temporal tras el clic en el enlace del correo.
  // Se revisa antes que cualquier otra lógica de sesión (no usamos react-router).
  if (window.location.pathname === "/reset-password") {
    return (
      <ResetPassword
        onDone={async () => {
          // Cierra la sesión temporal de recuperación y vuelve al login normal
          await signOut();
          window.location.href = "/";
        }}
      />
    );
  }

  // ── Cargando sesión ──
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "grid", placeItems: "center", color: "var(--t3)" }}>
        <div style={{ textAlign: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"
            style={{ animation: "spin 1s linear infinite", marginBottom: "12px" }}>
            <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: "13px" }}>Cargando sesión…</div>
        </div>
      </div>
    );
  }

  // ── Sin sesión ──
  if (!session || !user) {
    return (
      <>
        <Login/>
      </>
    );
  }

  // ── Dashboard ──
  return (
    <div className="app-shell">
      <Sidebar
        active={view}
        onNav={setView}
        theme={theme}
        onToggleTheme={toggleTheme}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <div className="app-shell__main">
        <header className="app-topbar">
          <div className="app-topbar__left">
            <button
              type="button"
              className="app-topbar__menuBtn"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>
            <div className="app-topbar__titles">
              <div className="app-topbar__title">{PAGE_INFO[view].title}</div>
              <div className="app-topbar__sub">{PAGE_INFO[view].sub}</div>
            </div>
          </div>

          <div className="app-topbar__actions">
            <div className="app-topbar__mesa">
              <span className="app-topbar__mesaDot" />
              Mesa P2P · Principal
            </div>
            <button
              type="button"
              className="app-topbar__cta"
              onClick={() => setCreateLinkOpen(true)}
              aria-label="Crear link"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              <span>Crear Link</span>
            </button>
          </div>
        </header>

        <main className="app-canvas">
          {view === "home"       && <HomeView         fmt={fmt} onToast={addToast} />}
          {view === "cuenta"     && <EstadoCuentaView fmt={fmt} onToast={addToast} />}
          {view === "onboarding" && <OnboardingView   onToast={addToast} />}
          {view === "admin"      && <AdminView        onToast={addToast} />}
          {view === "billeteras"  && <BilleterasView  fmt={fmt} onToast={addToast} />}
          {view === "movimientos" && <MovimientosView fmt={fmt} onToast={addToast} />}
          {view === "cuentas"     && <CuentasView     onToast={addToast} />}
          {view === "tarifas"     && <TarifasView />}
          {view === "reportes"    && <ReportesView    fmt={fmt} />}
          {view === "seguridad"   && <SeguridadView    onToast={addToast} />}
        </main>
      </div>

      <CreateLinkModal
        isOpen={createLinkOpen}
        onClose={() => setCreateLinkOpen(false)}
        onToast={addToast}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}