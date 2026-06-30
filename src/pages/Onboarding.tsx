// src/pages/Onboarding.tsx
import React, { useState, useEffect } from "react";
import { Input } from "../components/ui/Input";
import { registerBrebMerchant, getBrebKeys } from "../lib/bepayClient";
import type { ToastType } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

const DOCUMENT_TYPES = [
  { value: "CC",   label: "Cédula de ciudadanía" },
  { value: "CE",   label: "Cédula de extranjería" },
  { value: "NIT",  label: "NIT" },
  { value: "PAS",  label: "Pasaporte" },
  { value: "PEP",  label: "Permiso Especial de Permanencia" },
  { value: "PPT",  label: "Permiso de Protección Temporal" },
  { value: "NUIP", label: "NUIP" },
];

const DANE_CODES = [
  { value: "08001", label: "Barranquilla" },
  { value: "11001", label: "Bogotá D.C." },
  { value: "05001", label: "Medellín" },
  { value: "76001", label: "Cali" },
  { value: "13001", label: "Cartagena" },
  { value: "68001", label: "Bucaramanga" },
  { value: "20001", label: "Valledupar" },
  { value: "47001", label: "Santa Marta" },
  { value: "23001", label: "Montería" },
  { value: "70001", label: "Sincelejo" },
];

type Status = "checking" | "not_registered" | "registered";

export const OnboardingView: React.FC<Props> = ({ onToast }) => {
  const [status, setStatus]   = useState<Status>("checking");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [keyCount, setKeyCount] = useState(0);

  const [form, setForm] = useState({
    mobile_number:    "",
    document_type:    "CC",
    document_number:  "",
    first_name:       "",
    middle_name:      "",
    first_surname:    "",
    middle_surname:   "",
    dane_code:        "08001",
    commerce_name:    "",
    email:            "",
    gender:           "Masculino" as "Masculino" | "Femenino",
    address:          "",
    birth_place:      "",
    dob:              "",
    issue_date:       "",
    reference:        "",
  });

  const field = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Al entrar, verifica si el comercio ya está registrado consultando si tiene llaves
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setStatus("checking");
    try {
      const res = await getBrebKeys();
      if (res?.success && Array.isArray(res.data)) {
        setKeyCount(res.data.length);
        setStatus("registered");
      } else {
        setStatus("not_registered");
      }
    } catch {
      setStatus("not_registered");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px",
    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none",
  };
  const selectStyle: React.CSSProperties = { ...inputStyle };

  const requiredFields: (keyof typeof form)[] = [
    "mobile_number", "document_number", "first_name", "first_surname",
    "commerce_name", "email", "address", "birth_place", "dob", "issue_date",
  ];
  const missingFields = requiredFields.filter((f) => !form[f]?.trim());
  const mobileValid = /^3[0-6][0-9]{8}$/.test(form.mobile_number);
  const canSubmit = missingFields.length === 0 && mobileValid;

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError("Completa todos los campos obligatorios. El celular debe ser un número colombiano válido (300-369XXXXXXX).");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await registerBrebMerchant({
        ...form,
        reference: form.reference || undefined,
      });

      if (res?.success === false) {
        setError(typeof res.message === "string" ? res.message : JSON.stringify(res.message));
        return;
      }

      onToast("ok", "Comercio registrado en Bre-B", "Ya puedes crear llaves de pago");
      await checkStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", padding: "2px 0 8px", borderBottom: "1px solid var(--border)", marginTop: "4px" }}>
      {text}
    </div>
  );

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px" }}>Onboarding Bre-B</h1>
        <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>
          Registro único de tu comercio en el ecosistema Bre-B
        </p>
      </div>

      {/* ── Estado: verificando ── */}
      {status === "checking" && (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--t3)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }}>
            <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
          </svg>
          Verificando estado del comercio…
        </div>
      )}

      {/* ── Estado: ya registrado ── */}
      {status === "registered" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "32px", boxShadow: "var(--shadow)", textAlign: "center" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>Comercio registrado en Bre-B</h2>
          <p style={{ color: "var(--t2)", fontSize: "13.5px", marginBottom: "20px" }}>
            Tu comercio ya está activo. Tienes {keyCount} llave{keyCount !== 1 ? "s" : ""} registrada{keyCount !== 1 ? "s" : ""}.
          </p>
          <button
            onClick={() => setStatus("not_registered")}
            style={{ padding: "9px 18px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
          >
            Ver formulario de registro de nuevo
          </button>
        </div>
      )}

      {/* ── Estado: no registrado — mostrar formulario ── */}
      {status === "not_registered" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px", boxShadow: "var(--shadow)" }}>

          <div style={{ padding: "12px 14px", background: "var(--warning-dim)", border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)", lineHeight: 1.6, marginBottom: "20px" }}>
            Este registro es <b style={{ color: "var(--warning)" }}>único y permanente</b> en producción. Verifica que los datos sean correctos antes de enviar.
          </div>

          {sectionTitle("Datos del comercio")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Nombre comercial" required value={form.commerce_name}
                onChange={(e) => field("commerce_name")(e.target.value)} placeholder="Bóveda P2P" />
            </div>
            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Ciudad</label>
              <select value={form.dane_code} onChange={(e) => field("dane_code")(e.target.value)} style={selectStyle}>
                {DANE_CODES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <Input label="Referencia (opcional)" value={form.reference}
              onChange={(e) => field("reference")(e.target.value)} placeholder="Sub-comercio o sucursal" />
          </div>

          {sectionTitle("Datos del representante")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "8px" }}>
            <Input label="Primer nombre" required value={form.first_name}
              onChange={(e) => field("first_name")(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ""))} placeholder="Carlos" maxLength={25} />
            <Input label="Segundo nombre" value={form.middle_name}
              onChange={(e) => field("middle_name")(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ""))} placeholder="Opcional" maxLength={25} />
            <Input label="Primer apellido" required value={form.first_surname}
              onChange={(e) => field("first_surname")(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ""))} placeholder="Mendoza" maxLength={25} />
            <Input label="Segundo apellido" value={form.middle_surname}
              onChange={(e) => field("middle_surname")(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ""))} placeholder="Opcional" maxLength={25} />

            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Tipo de documento</label>
              <select value={form.document_type} onChange={(e) => field("document_type")(e.target.value)} style={selectStyle}>
                {DOCUMENT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <Input label="Número de documento" required value={form.document_number}
              onChange={(e) => field("document_number")(e.target.value.replace(/\D/g, ""))} placeholder="1234567890" />

            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Género</label>
              <select value={form.gender} onChange={(e) => field("gender")(e.target.value as any)} style={selectStyle}>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
            </div>
            <Input label="Celular" required value={form.mobile_number}
              onChange={(e) => field("mobile_number")(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="3001234567"
              error={form.mobile_number && !mobileValid ? "Debe empezar en 300-369 y tener 10 dígitos" : undefined}
            />

            <Input label="Fecha de nacimiento" required type="date" value={form.dob}
              onChange={(e) => field("dob")(e.target.value)} />
            <Input label="Fecha de expedición del documento" required type="date" value={form.issue_date}
              onChange={(e) => field("issue_date")(e.target.value)} />

            <Input label="Lugar de nacimiento" required value={form.birth_place}
              onChange={(e) => field("birth_place")(e.target.value)} placeholder="Barranquilla, Colombia" />
            <Input label="Correo electrónico" required type="email" value={form.email}
              onChange={(e) => field("email")(e.target.value)} placeholder="contacto@empresa.com" />

            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Dirección" required value={form.address}
                onChange={(e) => field("address")(e.target.value)} placeholder="Calle 100 #10-20, Barranquilla" help="Mínimo 10 caracteres" />
            </div>
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)", marginBottom: "16px" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ padding: "11px 24px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "14px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Registrando…" : "Completar registro"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};