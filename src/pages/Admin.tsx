// src/pages/Admin.tsx
import React, { useState } from "react";
import { useAdmin } from "../hooks/useAdmin";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import type { ToastType, CreateUserInput } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// ── Formato COP ───────────────────────────────────────────────────
const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

// ── Modal editar tarifas ──────────────────────────────────────────
interface TarifaModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  current: { recibir: number; enviar: number; variable: number };
  onSave: (recibir: number, enviar: number, variable: number) => Promise<void>;
}

function TarifaModal({ isOpen, onClose, userName, current, onSave }: TarifaModalProps) {
  const [recibir,  setRecibir]  = useState(String(current.recibir));
  const [enviar,   setEnviar]   = useState(String(current.enviar));
  const [variable, setVariable] = useState(String((current.variable * 100).toFixed(4)));
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleSave = async () => {
    const r = parseInt(recibir)   || 0;
    const e = parseInt(enviar)    || 0;
    const v = parseFloat(variable) / 100;
    if (r < 0 || e < 0 || v < 0) { setError("Los valores no pueden ser negativos"); return; }
    setSaving(true);
    setError(null);
    await onSave(r, e, v);
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar tarifas"
      subtitle={`Usuario: ${userName}`}
      maxWidth={420}
      footer={
        <>
          <button onClick={onClose} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "Guardar tarifas"}
          </button>
        </>
      }
    >
      {/* Preview tarifas actuales */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: "12px 14px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "4px" }}>
        {[
          { label: "Por recibir",  value: fmtCOP(current.recibir) },
          { label: "Por enviar",   value: fmtCOP(current.enviar) },
          { label: "Variable",     value: `${(current.variable * 100).toFixed(2)}%` },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "3px" }}>Actual</div>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>{s.value}</div>
            <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "3px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ height: "1px", background: "var(--border)", margin: "4px 0 14px" }} />

      <Input
        label="Tarifa por RECIBIR (cargo fijo en COP)"
        value={recibir}
        onChange={(e) => setRecibir(e.target.value.replace(/\D/g, ""))}
        placeholder="1190"
        prefix="$"
        help="Monto fijo que se cobra al usuario por cada transacción recibida"
      />
      <Input
        label="Tarifa por ENVIAR (cargo fijo en COP)"
        value={enviar}
        onChange={(e) => setEnviar(e.target.value.replace(/\D/g, ""))}
        placeholder="1190"
        prefix="$"
        help="Monto fijo que se cobra al usuario por cada dispersión enviada"
      />
      <Input
        label="Tarifa variable (%)"
        value={variable}
        onChange={(e) => setVariable(e.target.value)}
        placeholder="0.12"
        prefix="%"
        help="Porcentaje adicional sobre el monto enviado (ej: 0.12 = 0.12%)"
      />

      {/* Preview nueva tarifa */}
      {(parseInt(recibir) > 0 || parseInt(enviar) > 0) && (
        <div style={{ padding: "12px 14px", background: "var(--accent-dim)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)" }}>
          <b style={{ color: "var(--accent)", display: "block", marginBottom: "5px" }}>Vista previa nueva tarifa</b>
          Recibir: <b>{fmtCOP(parseInt(recibir) || 0)}</b> · Enviar: <b>{fmtCOP(parseInt(enviar) || 0)} + {parseFloat(variable) || 0}%</b>
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 14px", background: "var(--error-dim)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>{error}</div>
      )}
    </Modal>
  );
}

// ── Página principal Admin ────────────────────────────────────────
export const AdminView: React.FC<Props> = ({ onToast }) => {
  const { users, loading, error, createUser, updateTarifa, toggleActive } = useAdmin();

  const [createOpen, setCreateOpen]     = useState(false);
  const [tarifaTarget, setTarifaTarget] = useState<string | null>(null);
  const [query, setQuery]               = useState("");

  // Formulario crear usuario
  const [form, setForm] = useState<CreateUserInput>({
    email: "", password: "", full_name: "", role: "operator",
    tarifa_recibir: 1190, tarifa_enviar: 1190, tarifa_variable: 0.0012,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating]   = useState(false);

  const ff = (k: keyof CreateUserInput) => (v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.full_name) {
      setFormError("Completa todos los campos obligatorios"); return;
    }
    if (form.password.length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres"); return;
    }
    setCreating(true); setFormError(null);
    const err = await createUser(form);
    setCreating(false);
    if (err) { setFormError(err); return; }
    onToast("ok", "Usuario creado", form.full_name);
    setForm({ email:"", password:"", full_name:"", role:"operator", tarifa_recibir:1190, tarifa_enviar:1190, tarifa_variable:0.0012 });
    setCreateOpen(false);
  };

  const handleToggle = async (userId: string, currentActive: boolean, name: string) => {
    const action = currentActive ? "desactivar" : "activar";
    if (!confirm(`¿Deseas ${action} a ${name}?`)) return;
    const err = await toggleActive(userId, !currentActive);
    if (err) onToast("error", "Error", err);
    else onToast("ok", currentActive ? "Usuario desactivado" : "Usuario activado", name);
  };

  const filtered = users.filter((u) => {
    const q = query.toLowerCase();
    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const tarifaUser = tarifaTarget ? users.find((u) => u.id === tarifaTarget) : null;

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: "11px", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: ".5px",
    color: "var(--t3)", borderBottom: "1px solid var(--border)", textAlign: "left",
  };
  const tdStyle: React.CSSProperties = {
    padding: "12px 14px", borderBottom: "1px solid var(--border)", fontSize: "13px",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 11px",
    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    background: "var(--bg)", color: "var(--t1)", fontSize: "13px", outline: "none",
  };

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "Total usuarios",  value: users.length,                                        color: "var(--accent)" },
          { label: "Activos",         value: users.filter(u => u.is_active).length,               color: "var(--success)" },
          { label: "Inactivos",       value: users.filter(u => !u.is_active).length,              color: "var(--error)" },
          { label: "Administradores", value: users.filter(u => u.role === "admin").length,        color: "var(--warning)" },
        ].map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 18px", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: "26px", fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "11.5px", color: "var(--t3)", marginTop: "3px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Barra de acciones ── */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "14px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"
            style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }}>
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o email…"
            style={{ ...inputStyle, paddingLeft: "30px" }}
          />
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Crear usuario
        </button>
      </div>

      {/* ── Tabla usuarios ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)" }}>Cargando usuarios…</div>
        ) : error ? (
          <div style={{ padding: "24px", color: "var(--error)", textAlign: "center", fontSize: "13px" }}>{error}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Usuario", "Rol", "Tarifa recibir", "Tarifa enviar", "Variable", "Estado", "Registro", "Acciones"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--t3)" }}>Sin resultados</td></tr>
                ) : filtered.map((u) => (
                  <tr key={u.id}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Usuario */}
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: u.role === "admin" ? "linear-gradient(135deg, var(--warning), #f59e0b)" : "linear-gradient(135deg, #2dd4bf, var(--accent))", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "11px", color: "#fff", flexShrink: 0 }}>
                          {u.full_name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                          <div style={{ fontSize: "11px", color: "var(--t3)" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Rol */}
                    <td style={tdStyle}>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, color: u.role === "admin" ? "var(--warning)" : "var(--accent)", background: u.role === "admin" ? "var(--warning-dim)" : "var(--accent-dim)" }}>
                        {u.role}
                      </span>
                    </td>

                    {/* Tarifas */}
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                      {fmtCOP(u.tarifa_recibir)}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                      {fmtCOP(u.tarifa_enviar)}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                      {(u.tarifa_variable * 100).toFixed(2)}%
                    </td>

                    {/* Estado */}
                    <td style={tdStyle}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "7px", fontSize: "11.5px", fontWeight: 600, color: u.is_active ? "var(--success)" : "var(--error)", background: u.is_active ? "var(--success-dim)" : "var(--error-dim)" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: u.is_active ? "var(--success)" : "var(--error)", animation: u.is_active ? "pulse 2s infinite" : undefined }} />
                        {u.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>

                    {/* Fecha */}
                    <td style={{ ...tdStyle, fontSize: "12px", color: "var(--t3)" }}>
                      {new Date(u.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>

                    {/* Acciones */}
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => setTarifaTarget(u.id)}
                          title="Editar tarifas"
                          style={{ padding: "5px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--accent)", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "5px" }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Tarifa
                        </button>

                        {u.role !== "admin" && (
                          <button
                            onClick={() => handleToggle(u.id, u.is_active, u.full_name)}
                            title={u.is_active ? "Desactivar" : "Activar"}
                            style={{ padding: "5px 10px", border: `1px solid ${u.is_active ? "rgba(239,68,68,.3)" : "rgba(34,197,94,.3)"}`, borderRadius: "var(--radius-sm)", background: u.is_active ? "var(--error-dim)" : "var(--success-dim)", color: u.is_active ? "var(--error)" : "var(--success)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                          >
                            {u.is_active ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal crear usuario ── */}
      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); setFormError(null); }}
        title="Crear nuevo usuario"
        subtitle="El usuario podrá iniciar sesión inmediatamente"
        maxWidth={520}
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={creating} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer", opacity: creating ? 0.6 : 1 }}>
              {creating ? "Creando…" : "Crear usuario"}
            </button>
          </>
        }
      >
        {/* Datos de acceso */}
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", paddingBottom: "8px", borderBottom: "1px solid var(--border)", marginBottom: "14px" }}>
          Datos de acceso
        </div>
        <Input label="Nombre completo" required value={form.full_name} onChange={(e) => ff("full_name")(e.target.value)} placeholder="Carlos Mendoza" />
        <Input label="Correo electrónico" required type="email" value={form.email} onChange={(e) => ff("email")(e.target.value)} placeholder="usuario@empresa.com" />
        <Input label="Contraseña temporal" required type="password" value={form.password} onChange={(e) => ff("password")(e.target.value)} placeholder="Mínimo 8 caracteres" help="El usuario puede cambiarla después" />

        {/* Rol */}
        <div>
          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", marginBottom: "7px" }}>Rol</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {[{ v: "operator", label: "Operador", desc: "Puede operar la plataforma" }, { v: "viewer", label: "Visor", desc: "Solo lectura" }].map((opt) => (
              <button
                key={opt.v}
                onClick={() => ff("role")(opt.v)}
                style={{ flex: 1, padding: "10px 12px", border: `1.5px solid ${form.role === opt.v ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", background: form.role === opt.v ? "var(--accent-dim)" : "transparent", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ fontWeight: 600, fontSize: "13px", color: form.role === opt.v ? "var(--accent)" : "var(--t1)" }}>{opt.label}</div>
                <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tarifas personalizadas */}
        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", paddingBottom: "8px", borderBottom: "1px solid var(--border)", marginBottom: "14px", marginTop: "6px" }}>
          Tarifas personalizadas
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <Input
            label="Por recibir (COP)"
            value={String(form.tarifa_recibir)}
            onChange={(e) => ff("tarifa_recibir")(parseInt(e.target.value.replace(/\D/g,"")) || 0)}
            prefix="$"
            placeholder="1190"
          />
          <Input
            label="Por enviar (COP)"
            value={String(form.tarifa_enviar)}
            onChange={(e) => ff("tarifa_enviar")(parseInt(e.target.value.replace(/\D/g,"")) || 0)}
            prefix="$"
            placeholder="1190"
          />
          <Input
            label="Variable (%)"
            value={String((form.tarifa_variable * 100).toFixed(4))}
            onChange={(e) => ff("tarifa_variable")(parseFloat(e.target.value) / 100 || 0)}
            prefix="%"
            placeholder="0.12"
          />
        </div>

        {/* Preview tarifa */}
        <div style={{ padding: "11px 14px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)" }}>
          Recibir: <b>{fmtCOP(form.tarifa_recibir)}</b> · Enviar: <b>{fmtCOP(form.tarifa_enviar)} + {(form.tarifa_variable * 100).toFixed(2)}%</b>
        </div>

        {formError && (
          <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
            {formError}
          </div>
        )}
      </Modal>

      {/* ── Modal editar tarifas ── */}
      {tarifaUser && (
        <TarifaModal
          isOpen={!!tarifaTarget}
          onClose={() => setTarifaTarget(null)}
          userId={tarifaUser.id}
          userName={tarifaUser.full_name}
          current={{ recibir: tarifaUser.tarifa_recibir, enviar: tarifaUser.tarifa_enviar, variable: tarifaUser.tarifa_variable }}
          onSave={async (r, e, v) => {
            const err = await updateTarifa(tarifaUser.id, r, e, v);
            if (err) onToast("error", "Error", err);
            else onToast("ok", "Tarifas actualizadas", tarifaUser.full_name);
          }}
        />
      )}
    </div>
  );
};