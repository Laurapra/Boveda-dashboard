import { CreateLinkModal } from "./components/CreateLinkModal";
import { useState, useEffect } from "react";
import "./index.css";

import { useAuthStore } from "./store/authStore";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ToastContainer } from "./components/ui/Toast";
import { useToast } from "./hooks/useToast";

// Las páginas del dashboard (importarlas directamente por ahora)
import { HomeView } from "./pages/Home";
import { RecaudoView } from "./pages/Recaudo";
import { DispersionView } from "./pages/Dispersion";
import { EstadoCuentaView } from "./pages/EstadoCuenta";
import { Sidebar } from "./components/layout/SideBar.tsx";

type AuthScreen = "login" | "register";
type ViewKey = "home" | "recaudo" | "dispersion" | "cuenta";

// Formateador de pesos colombianos — se crea una vez y se pasa hacia abajo
const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});

export default function App() {
  const { user, session, loading, loadSession } = useAuthStore();
  const [authScreen, setAuthScreen] = useState<AuthScreen>("login");
  const [view, setView] = useState<ViewKey>("home");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  // Cargar sesión al arrancar la app
  useEffect(() => { loadSession(); }, []);

  // Sincronizar tema con el atributo HTML
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // ── Estado de carga inicial ──
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "grid", placeItems: "center", color: "var(--t3)" }}>
        <div style={{ textAlign: "center" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"
            style={{ animation: "spin 1s linear infinite", marginBottom: "12px" }}>
            <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
          </svg>
          <div>Cargando sesión…</div>
        </div>
      </div>
    );
  }

  // ── Sin sesión: mostrar Login o Register ──
  if (!session || !user) {
    return (
      <>
        {authScreen === "login"
          ? <Login onGoRegister={() => setAuthScreen("register")} />
          : <Register onGoLogin={() => setAuthScreen("login")} />
        }
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  // ── Con sesión: mostrar el dashboard ──
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar active={view} onNav={setView} />

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {/* Topbar */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          display: "flex", alignItems: "center", gap: "14px",
          padding: "13px 26px",
          background: "color-mix(in srgb, var(--bg) 86%, transparent)",
          backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)",
        }}>
          {/* Indicador de comercio activo */}
          <div style={{
            display: "flex", alignItems: "center", gap: "9px",
            padding: "7px 11px", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", background: "var(--surface)",
            fontWeight: 600, fontSize: "13px",
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 0 3px var(--success-dim)" }} />
            Mesa P2P · Principal
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            {/* Botón de tema */}
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              style={{ width: "36px", height: "36px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--t2)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                {theme === "dark"
                  ? <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" strokeLinejoin="round" />
                  : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" /></>
                }
              </svg>
            </button>

            <button
              onClick={() => setLinkModalOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 14px", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}
            >
              + Crear Link
            </button>
          </div>
        </header>

        {/* Contenido de la vista activa */}
        <main style={{ padding: "26px", flex: 1, overflowY: "auto" }}>
          {view === "home" && <HomeView fmt={COP.format.bind(COP)} onToast={addToast} />}
          {view === "recaudo" && <RecaudoView fmt={COP.format.bind(COP)} onToast={addToast} />}
          {view === "dispersion" && <DispersionView fmt={COP.format.bind(COP)} onToast={addToast} />}
          {view === "cuenta" && <EstadoCuentaView fmt={COP.format.bind(COP)} onToast={addToast} />}
        </main>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <CreateLinkModal
        isOpen={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        onToast={addToast}
      />
    </div>
  );
}