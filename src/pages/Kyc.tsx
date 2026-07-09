// src/pages/Kyc.tsx
import React, { useState, useEffect } from "react";
import { useKyc } from "../hooks/useKyc";
import { Input } from "../components/ui/Input";
import type { ToastType, KycStatus, DocumentType, BusinessType } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// ── Badge de estado reutilizable ─────────────────────────────────
function StatusBadge({ status }: { status: KycStatus }) {
  const cfg = {
    not_submitted: { label: "No enviado",  color: "var(--t3)",     bg: "var(--elevated)" },
    pending:       { label: "En revisión", color: "var(--warning)", bg: "var(--warning-dim)" },
    approved:      { label: "Aprobado",    color: "var(--success)", bg: "var(--success-dim)" },
    rejected:      { label: "Rechazado",   color: "var(--error)",   bg: "var(--error-dim)" },
  }[status];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, color: cfg.color, background: cfg.bg }}>
      {status === "pending"  && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: cfg.color, animation: "pulse 1.6s infinite" }} />}
      {status === "approved" && "✓ "}
      {status === "rejected" && "✗ "}
      {cfg.label}
    </span>
  );
}

// ── Zona de subida de archivos ───────────────────────────────────
interface UploadZoneProps {
  label: string;
  hint: string;
  currentUrl: string | null;
  onFile: (file: File) => void;
  uploading: boolean;
}

function UploadZone({ label, hint, currentUrl, onFile, uploading }: UploadZoneProps) {
  const [drag, setDrag] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)" }}>{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*,.pdf"; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) onFile(f); }; i.click(); }}
        style={{
          border: `1.5px dashed ${drag ? "var(--accent)" : currentUrl ? "var(--success)" : "var(--border-strong)"}`,
          borderRadius: "var(--radius-sm)", padding: "18px", textAlign: "center",
          background: drag ? "var(--accent-dim)" : currentUrl ? "var(--success-dim)" : "var(--bg)",
          cursor: uploading ? "not-allowed" : "pointer", transition: ".14s",
        }}
      >
        {uploading ? (
          <div style={{ color: "var(--t3)", fontSize: "12.5px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
            Subiendo…
          </div>
        ) : currentUrl ? (
          <div style={{ color: "var(--success)", fontSize: "12.5px", fontWeight: 600 }}>
            ✓ Archivo subido · haz clic para cambiar
          </div>
        ) : (
          <div style={{ color: "var(--t3)", fontSize: "12.5px" }}>
            <div style={{ fontWeight: 600, color: "var(--t2)", marginBottom: "3px" }}>Clic o arrastra aquí</div>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
//  COMPONENTE PRINCIPAL
// ================================================================
export const KycView: React.FC<Props> = ({ onToast }) => {
  const { kyc, kyb, loading, uploading, saveKyc, saveKyb, uploadFile } = useKyc();
  const [activeTab, setActiveTab] = useState<"personal" | "empresa">("personal");
  const [saving, setSaving] = useState(false);

  // ── Estado del formulario KYC personal ─────────────────────────
  const [kycForm, setKycForm] = useState({
    first_name: "", last_name: "", date_of_birth: "",
    nationality: "Colombiana",
    document_type: "cedula" as DocumentType, document_number: "",
    address: "", city: "", department: "",
  });

  // URLs de documentos subidos
  const [frontUrl, setFrontUrl]   = useState<string | null>(null);
  const [backUrl, setBackUrl]     = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  // ── Estado del formulario KYB empresa ──────────────────────────
  const [kybForm, setKybForm] = useState({
    business_name: "", business_type: "sas" as BusinessType,
    nit: "", incorporation_date: "",
    city: "", department: "", address: "", phone: "", website: "",
    legal_rep_name: "", legal_rep_doc_type: "cedula", legal_rep_doc_number: "",
  });

  const [rutUrl, setRutUrl]             = useState<string | null>(null);
  const [chamberUrl, setChamberUrl]     = useState<string | null>(null);
  const [legalRepDocUrl, setLegalRepDocUrl] = useState<string | null>(null);

  // Precarga datos existentes cuando cargan del servidor
  useEffect(() => {
    if (kyc) {
      setKycForm({
        first_name: kyc.first_name, last_name: kyc.last_name,
        date_of_birth: kyc.date_of_birth, nationality: kyc.nationality,
        document_type: kyc.document_type, document_number: kyc.document_number,
        address: kyc.address ?? "", city: kyc.city ?? "", department: kyc.department ?? "",
      });
      setFrontUrl(kyc.document_front_url);
      setBackUrl(kyc.document_back_url);
      setSelfieUrl(kyc.selfie_url);
    }
    if (kyb) {
      setKybForm({
        business_name: kyb.business_name, business_type: kyb.business_type,
        nit: kyb.nit, incorporation_date: kyb.incorporation_date ?? "",
        city: kyb.city ?? "", department: kyb.department ?? "",
        address: kyb.address ?? "", phone: kyb.phone ?? "", website: kyb.website ?? "",
        legal_rep_name: kyb.legal_rep_name, legal_rep_doc_type: kyb.legal_rep_doc_type,
        legal_rep_doc_number: kyb.legal_rep_doc_number,
      });
      setRutUrl(kyb.rut_url);
      setChamberUrl(kyb.chamber_commerce_url);
      setLegalRepDocUrl(kyb.legal_rep_doc_url);
    }
  }, [kyc, kyb]);

  const kycField = (k: keyof typeof kycForm) => (v: string) => setKycForm((p) => ({ ...p, [k]: v }));
  const kybField = (k: keyof typeof kybForm) => (v: string) => setKybForm((p) => ({ ...p, [k]: v }));

  // ── Handlers de archivos ────────────────────────────────────────
  const handleUpload = async (file: File, folder: string, setter: (u: string | null) => void) => {
    const url = await uploadFile(file, folder);
    if (url) setter(url);
    else onToast("error", "Error al subir", "Intenta con otro archivo");
  };

  // ── Submit KYC ──────────────────────────────────────────────────
  const handleSaveKyc = async () => {
    if (!kycForm.first_name || !kycForm.last_name || !kycForm.document_number || !kycForm.date_of_birth) {
      onToast("error", "Faltan campos", "Completa los datos personales obligatorios");
      return;
    }
    setSaving(true);
    const err = await saveKyc({
      ...kycForm,
      document_front_url: frontUrl,
      document_back_url:  backUrl,
      selfie_url:         selfieUrl,
    });
    setSaving(false);
    if (err) onToast("error", "Error", err);
    else onToast("ok", "KYC enviado", "Tu verificación está en revisión");
  };

  // ── Submit KYB ──────────────────────────────────────────────────
  const handleSaveKyb = async () => {
    if (!kybForm.business_name || !kybForm.nit || !kybForm.legal_rep_name || !kybForm.legal_rep_doc_number) {
      onToast("error", "Faltan campos", "Completa los datos de la empresa obligatorios");
      return;
    }
    setSaving(true);
    const err = await saveKyb({
      ...kybForm,
      rut_url:              rutUrl,
      chamber_commerce_url: chamberUrl,
      legal_rep_doc_url:    legalRepDocUrl,
    });
    setSaving(false);
    if (err) onToast("error", "Error", err);
    else onToast("ok", "KYB enviado", "Tu verificación empresarial está en revisión");
  };

  const selectStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px",
    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none",
  };

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".6px", padding: "4px 0 10px", borderBottom: "1px solid var(--border)", marginBottom: "16px" }}>
      {text}
    </div>
  );

  if (loading) return (
    <div style={{ textAlign: "center", padding: "60px", color: "var(--t3)" }}>Cargando…</div>
  );

  const kycStatus: KycStatus = kyc?.status ?? "not_submitted";
  const kybStatus: KycStatus = kyb?.status ?? "not_submitted";
  const kycApproved = kycStatus === "approved";
  const kybApproved = kybStatus === "approved";

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "23px", fontWeight: 700, letterSpacing: "-.4px" }}>Verificación KYC / KYB</h1>
        <p style={{ color: "var(--t2)", fontSize: "13.5px", marginTop: "3px" }}>
          Completa tu verificación para operar en la plataforma
        </p>
      </div>

      {/* Tarjetas de estado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "22px" }}>
        {[
          { key: "personal", label: "KYC Personal", sub: "Persona Natural", status: kycStatus, icon: "👤" },
          { key: "empresa",  label: "KYB Empresa",  sub: "Persona Jurídica", status: kybStatus, icon: "🏢" },
        ].map((card) => (
          <button
            key={card.key}
            onClick={() => setActiveTab(card.key as "personal" | "empresa")}
            style={{
              padding: "18px", borderRadius: "var(--radius)", textAlign: "left", cursor: "pointer",
              border: `${activeTab === card.key ? "1.5px solid var(--accent)" : "1px solid var(--border)"}`,
              background: activeTab === card.key ? "var(--accent-dim)" : "var(--surface)",
              boxShadow: "var(--shadow)", transition: ".14s",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--elevated)", display: "grid", placeItems: "center", fontSize: "18px" }}>
                  {card.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--t1)" }}>{card.label}</div>
                  <div style={{ fontSize: "12px", color: "var(--t3)" }}>{card.sub}</div>
                </div>
              </div>
              <StatusBadge status={card.status} />
            </div>
            {card.status === "rejected" && (
              <div style={{ marginTop: "10px", padding: "8px 12px", background: "var(--error-dim)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--error)" }}>
                ✗ {card.key === "personal" ? kyc?.rejection_reason : kyb?.rejection_reason}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* ── FORMULARIO KYC PERSONAL ─────────────────────────────── */}
      {activeTab === "personal" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px", boxShadow: "var(--shadow)" }}>

          {kycApproved && (
            <div style={{ padding: "14px 16px", background: "var(--success-dim)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)", borderRadius: "var(--radius-sm)", marginBottom: "20px", color: "var(--success)", fontWeight: 600, fontSize: "13px" }}>
              ✓ Tu identidad está verificada. No necesitas volver a enviar documentos.
            </div>
          )}

          {sectionTitle("Datos personales")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
            <Input label="Nombre" required value={kycForm.first_name}
              onChange={(e) => kycField("first_name")(e.target.value)} placeholder="Tu nombre" disabled={kycApproved} />
            <Input label="Apellidos" required value={kycForm.last_name}
              onChange={(e) => kycField("last_name")(e.target.value)} placeholder="Tus apellidos" disabled={kycApproved} />
            <Input label="Fecha de nacimiento" required type="date" value={kycForm.date_of_birth}
              onChange={(e) => kycField("date_of_birth")(e.target.value)} disabled={kycApproved} />
            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Nacionalidad</label>
              <select value={kycForm.nationality} onChange={(e) => kycField("nationality")(e.target.value)} style={selectStyle} disabled={kycApproved}>
                <option>Colombiana</option>
                <option>Venezolana</option>
                <option>Estadounidense</option>
                <option>Española</option>
                <option>Otra</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Tipo de documento</label>
              <select value={kycForm.document_type} onChange={(e) => kycField("document_type")(e.target.value as DocumentType)} style={selectStyle} disabled={kycApproved}>
                <option value="cedula">Cédula de ciudadanía</option>
                <option value="cedula_extranjeria">Cédula de extranjería</option>
                <option value="pasaporte">Pasaporte</option>
              </select>
            </div>
            <Input label="Número de documento" required value={kycForm.document_number}
              onChange={(e) => kycField("document_number")(e.target.value)} placeholder="1234567890" disabled={kycApproved} />
          </div>

          {sectionTitle("Dirección")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "20px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Dirección" value={kycForm.address}
                onChange={(e) => kycField("address")(e.target.value)} placeholder="Calle 100 #10-20" disabled={kycApproved} />
            </div>
            <Input label="Ciudad" value={kycForm.city}
              onChange={(e) => kycField("city")(e.target.value)} placeholder="Barranquilla" disabled={kycApproved} />
            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Departamento</label>
              <select value={kycForm.department} onChange={(e) => kycField("department")(e.target.value)} style={selectStyle} disabled={kycApproved}>
                <option value="">Selecciona</option>
                {["Atlántico","Bogotá D.C.","Antioquia","Valle del Cauca","Bolívar","Magdalena","Cundinamarca","Santander","Norte de Santander","Córdoba","Otros"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {!kycApproved && (
            <>
              {sectionTitle("Documentos")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "24px" }}>
                <UploadZone
                  label="Documento (frente)" hint="JPG, PNG o PDF · máx 5MB"
                  currentUrl={frontUrl} uploading={uploading}
                  onFile={(f) => handleUpload(f, "doc_front", setFrontUrl)}
                />
                <UploadZone
                  label="Documento (reverso)" hint="JPG, PNG o PDF · máx 5MB"
                  currentUrl={backUrl} uploading={uploading}
                  onFile={(f) => handleUpload(f, "doc_back", setBackUrl)}
                />
                <UploadZone
                  label="Selfie con documento" hint="Foto tuya sosteniendo el documento"
                  currentUrl={selfieUrl} uploading={uploading}
                  onFile={(f) => handleUpload(f, "selfie", setSelfieUrl)}
                />
              </div>
            </>
          )}

          {!kycApproved && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleSaveKyc}
                disabled={saving || uploading}
                style={{ padding: "11px 24px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "14px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Enviando…" : kycStatus === "not_submitted" ? "Enviar verificación" : "Actualizar y reenviar"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── FORMULARIO KYB EMPRESA ──────────────────────────────── */}
      {activeTab === "empresa" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px", boxShadow: "var(--shadow)" }}>

          {kybApproved && (
            <div style={{ padding: "14px 16px", background: "var(--success-dim)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)", borderRadius: "var(--radius-sm)", marginBottom: "20px", color: "var(--success)", fontWeight: 600, fontSize: "13px" }}>
              ✓ Tu empresa está verificada.
            </div>
          )}

          {sectionTitle("Datos de la empresa")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
            <Input label="Razón social" required value={kybForm.business_name}
              onChange={(e) => kybField("business_name")(e.target.value)} placeholder="Empresa S.A.S." disabled={kybApproved} />
            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Tipo de empresa</label>
              <select value={kybForm.business_type} onChange={(e) => kybField("business_type")(e.target.value)} style={selectStyle} disabled={kybApproved}>
                <option value="sas">S.A.S.</option>
                <option value="ltda">Ltda.</option>
                <option value="sa">S.A.</option>
                <option value="natural">Persona Natural</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <Input label="NIT" required value={kybForm.nit}
              onChange={(e) => kybField("nit")(e.target.value)} placeholder="900.123.456-1" disabled={kybApproved} />
            <Input label="Fecha de constitución" type="date" value={kybForm.incorporation_date}
              onChange={(e) => kybField("incorporation_date")(e.target.value)} disabled={kybApproved} />
            <Input label="Ciudad" value={kybForm.city}
              onChange={(e) => kybField("city")(e.target.value)} placeholder="Barranquilla" disabled={kybApproved} />
            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Departamento</label>
              <select value={kybForm.department} onChange={(e) => kybField("department")(e.target.value)} style={selectStyle} disabled={kybApproved}>
                <option value="">Selecciona</option>
                {["Atlántico","Bogotá D.C.","Antioquia","Valle del Cauca","Bolívar","Magdalena","Cundinamarca","Santander","Norte de Santander","Córdoba","Otros"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <Input label="Dirección" value={kybForm.address}
              onChange={(e) => kybField("address")(e.target.value)} placeholder="Cra 50 #80-20" disabled={kybApproved} />
            <Input label="Teléfono" value={kybForm.phone}
              onChange={(e) => kybField("phone")(e.target.value)} placeholder="+57 300 000 0000" disabled={kybApproved} />
            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Sitio web (opcional)" value={kybForm.website}
                onChange={(e) => kybField("website")(e.target.value)} placeholder="https://empresa.com" disabled={kybApproved} />
            </div>
          </div>

          {sectionTitle("Representante legal")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "20px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Nombre completo del representante" required value={kybForm.legal_rep_name}
                onChange={(e) => kybField("legal_rep_name")(e.target.value)} placeholder="Nombre y apellidos" disabled={kybApproved} />
            </div>
            <div>
              <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)", display: "block", marginBottom: "7px" }}>Tipo de documento</label>
              <select value={kybForm.legal_rep_doc_type} onChange={(e) => kybField("legal_rep_doc_type")(e.target.value)} style={selectStyle} disabled={kybApproved}>
                <option value="cedula">Cédula</option>
                <option value="pasaporte">Pasaporte</option>
              </select>
            </div>
            <div style={{ gridColumn: "2/4" }}>
              <Input label="Número de documento" required value={kybForm.legal_rep_doc_number}
                onChange={(e) => kybField("legal_rep_doc_number")(e.target.value)} placeholder="1234567890" disabled={kybApproved} />
            </div>
          </div>

          {!kybApproved && (
            <>
              {sectionTitle("Documentos requeridos")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "24px" }}>
                <UploadZone
                  label="RUT actualizado" hint="PDF o imagen · máx 5MB"
                  currentUrl={rutUrl} uploading={uploading}
                  onFile={(f) => handleUpload(f, "rut", setRutUrl)}
                />
                <UploadZone
                  label="Cámara de comercio" hint="No mayor a 90 días · máx 5MB"
                  currentUrl={chamberUrl} uploading={uploading}
                  onFile={(f) => handleUpload(f, "chamber", setChamberUrl)}
                />
                <UploadZone
                  label="Doc. representante legal" hint="Cédula o pasaporte vigente"
                  currentUrl={legalRepDocUrl} uploading={uploading}
                  onFile={(f) => handleUpload(f, "legal_rep", setLegalRepDocUrl)}
                />
              </div>
            </>
          )}

          {!kybApproved && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleSaveKyb}
                disabled={saving || uploading}
                style={{ padding: "11px 24px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "14px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Enviando…" : kybStatus === "not_submitted" ? "Enviar verificación" : "Actualizar y reenviar"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};