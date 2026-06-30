// src/components/RegisterBrebMerchantModal.tsx
import React, { useState } from "react";
import { Modal } from "./ui/Modal";
import { Input } from "./ui/Input";
import { registerBrebMerchant } from "../lib/bepayClient";
import type { ToastType } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (type: ToastType, title: string, msg: string) => void;
  onSuccess?: () => void; // se llama cuando el registro fue exitoso
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

// Códigos DANE de las principales ciudades de Colombia
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

export const RegisterBrebMerchantModal: React.FC<Props> = ({ isOpen, onClose, onToast, onSuccess }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px",
    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle };

  // Validación de campos obligatorios
  const requiredFields: (keyof typeof form)[] = [
    "mobile_number", "document_number", "first_name", "first_surname",
    "commerce_name", "email", "address", "birth_place", "dob", "issue_date",
  ];
  const missingFields = requiredFields.filter((f) => !form[f]?.trim());
  const mobileValid = /^3[0-6][0-9]{8}$/.test(form.mobile_number);
  const canSubmit = missingFields.length === 0 && mobileValid;

  const handleClose = () => {
    setError(null);
    onClose();
  };

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
        setError(res.message ? JSON.stringify(res.message) : "Bepay rechazó el registro");
        return;
      }

      onToast("ok", "Comercio registrado en Bre-B", "Ya puedes crear llaves de pago");
      onSuccess?.();
      handleClose();
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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Registro de comercio en Bre-B"
      subtitle="Necesario una sola vez para poder crear llaves de pago"
      maxWidth={620}
      footer={
        <>
          <button
            onClick={handleClose}
            style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Registrando…" : "Completar registro"}
          </button>
        </>
      }
    >
      {/* Aviso */}
      <div style={{ padding: "12px 14px", background: "var(--warning-dim)", border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)", lineHeight: 1.6 }}>
        Este registro es <b style={{ color: "var(--warning)" }}>único y permanente</b> en producción. Verifica que los datos sean correctos antes de enviar.
      </div>

      {sectionTitle("Datos del comercio")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
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
        <div style={{ padding: "10px 14px", background: "var(--error-dim)", border: "1px solid rgba(239,68,68,.25)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--error)" }}>
          {error}
        </div>
      )}
    </Modal>
  );
};