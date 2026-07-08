// src/App.tsx
import { useState, useEffect } from "react";
import "./index.css";

import { useAuthStore } from "./store/authStore";
import { Login }    from "./pages/Login";
import { Register } from "./pages/Register";
import { ToastContainer } from "./components/ui/Toast";
import { useToast } from "./hooks/useToast";

import { Sidebar, type ViewKey } from "./components/layout/SideBar";

// Páginas existentes
import { HomeView }         from "./pages/Home";
import { RecaudoView }      from "./pages/Recaudo";
import { DispersionView }   from "./pages/Dispersion";
import { EstadoCuentaView } from "./pages/EstadoCuenta";
import { BankAccountsView } from "./pages/BankAccounts";
import { KycView }          from "./pages/Kyc";
import { OnboardingView }   from "./pages/Onboarding";

// Páginas nuevas
import { BilleterasView }    from "./pages/Billeteras";
import { MovimientosView }   from "./pages/Movimientos";
import { BeneficiariosView } from "./pages/Beneficiarios";
import { TarifasView }       from "./pages/Tarifas";
import { ReportesView }      from "./pages/Reportes";

type AuthScreen = "login" | "register";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});

const PAGE_INFO: Record<ViewKey, { title: string; sub: string }> = {
  home:                { title: "Inicio",              sub: "Bienvenido al portal Global Coin" },
  billeteras:          { title: "Mis billeteras",      sub: "Gestiona tus cuentas en diferentes divisas" },
  movimientos:         { title: "Movimientos",         sub: "Historial de dispersiones realizadas" },
  beneficiarios:       { title: "Beneficiarios",       sub: "Gestiona tus beneficiarios y sus cuentas bancarias" },
  recaudo:             { title: "Recaudo",              sub: "Transacciones de entrada · Nequi, Bre-B y Links de pago" },
  dispersion:          { title: "Dispersión",           sub: "Envía fondos a llaves Bre-B o cuentas" },
  cuenta:              { title: "Estado de Cuenta",    sub: "Movimientos, comisiones y reportes financieros" },
  "cuentas-bancarias": { title: "Cuentas Bancarias",   sub: "Gestiona las cuentas para tus dispersiones" },
  tarifas:             { title: "Mis tarifas",         sub: "Comisiones y costos por operación" },
  reportes:            { title: "Reportes",            sub: "Descarga reportes en PDF o XML" },
  kyc:                 { title: "Verificación KYC",    sub: "Completa tu verificación para operar en la plataforma" },
  onboarding:          { title: "Onboarding Bre-B",    sub: "Registro único de tu comercio en el ecosistema Bre-B" },
};

export default function App() {
  const { user, session, loading, loadSession } = useAuthStore();
  const [authScreen, setAuthScreen] = useState<AuthScreen>("login");
  const [view, setView]             = useState<ViewKey>("home");
  const [theme, setTheme]           = useState<"dark" | "light">("dark");
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => { loadSession(); }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => t === "dark" ? "light" : "dark");
  const fmt = COP.format.bind(COP);

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
        {authScreen === "login"
          ? <Login    onGoRegister={() => setAuthScreen("register")} />
          : <Register onGoLogin={()    => setAuthScreen("login")} />
        }
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  // ── Dashboard ──
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        active={view}
        onNav={setView}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Topbar */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 26px",
          background: "color-mix(in srgb, var(--bg) 86%, transparent)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "-.2px" }}>
              {PAGE_INFO[view].title}
            </div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "1px" }}>
              {PAGE_INFO[view].sub}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", fontSize: "13px", fontWeight: 500, color: "var(--t2)" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 0 3px var(--success-dim)" }} />
              Mesa P2P · Principal
            </div>
            <button
              onClick={() => addToast("info", "Próximamente", "Modal de creación de links")}
              style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 14px", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 6px 16px -8px var(--accent-ring)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="15" height="15">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Crear Link
            </button>
          </div>
        </header>

        {/* Canvas */}
        <main style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>

          {/* Páginas existentes */}
          {view === "home"              && <HomeView         fmt={fmt} onToast={addToast} />}
          {view === "recaudo"           && <RecaudoView      fmt={fmt} onToast={addToast} />}
          {view === "dispersion"        && <DispersionView   fmt={fmt} onToast={addToast} />}
          {view === "cuenta"            && <EstadoCuentaView fmt={fmt} onToast={addToast} />}
          {view === "cuentas-bancarias" && <BankAccountsView onToast={addToast} />}
          {view === "kyc"               && <KycView          onToast={addToast} />}
          {view === "onboarding"        && <OnboardingView   onToast={addToast} />}

          {/* Páginas nuevas */}
          {view === "billeteras"    && <BilleterasView    fmt={fmt} onToast={addToast} />}
          {view === "movimientos"   && <MovimientosView   fmt={fmt} onToast={addToast} />}
          {view === "beneficiarios" && <BeneficiariosView fmt={fmt} onToast={addToast} />}
          {view === "tarifas"       && <TarifasView />}
          {view === "reportes"      && <ReportesView      fmt={fmt} />}

        </main>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}