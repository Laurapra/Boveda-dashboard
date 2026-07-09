// src/pages/Onboarding.tsx
import React, { useState } from "react";
import { registerBrebMerchant } from "../lib/bepayClient";
import type { ToastType } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// ── Datos geográficos Colombia ────────────────────────────────────
const DEPARTAMENTOS = [
  {name:"Amazonas",code:"AMA"},{name:"Antioquia",code:"ANT"},
  {name:"Arauca",code:"ARA"},{name:"Atlántico",code:"ATL"},
  {name:"Bogotá D.C.",code:"BOG"},{name:"Bolívar",code:"BOL"},
  {name:"Boyacá",code:"BOY"},{name:"Caldas",code:"CAL"},
  {name:"Caquetá",code:"CAQ"},{name:"Casanare",code:"CAS"},
  {name:"Cauca",code:"CAU"},{name:"Cesar",code:"CES"},
  {name:"Chocó",code:"CHO"},{name:"Córdoba",code:"COR"},
  {name:"Cundinamarca",code:"CUN"},{name:"Guainía",code:"GUA"},
  {name:"Guaviare",code:"GUV"},{name:"Huila",code:"HUI"},
  {name:"La Guajira",code:"LAG"},{name:"Magdalena",code:"MAG"},
  {name:"Meta",code:"MET"},{name:"Nariño",code:"NAR"},
  {name:"Norte de Santander",code:"NSA"},{name:"Putumayo",code:"PUT"},
  {name:"Quindío",code:"QUI"},{name:"Risaralda",code:"RIS"},
  {name:"San Andrés y Providencia",code:"SAP"},{name:"Santander",code:"SAN"},
  {name:"Sucre",code:"SUC"},{name:"Tolima",code:"TOL"},
  {name:"Valle del Cauca",code:"VAC"},{name:"Vaupés",code:"VAU"},
  {name:"Vichada",code:"VIC"},
].sort((a,b) => a.name.localeCompare(b.name, "es"));

const CIUDADES: Record<string, {name:string; dane:string}[]> = {
  ANT:[{name:"Medellín",dane:"05001"},{name:"Envigado",dane:"05266"},{name:"Bello",dane:"05088"},{name:"Itagüí",dane:"05360"},{name:"Rionegro",dane:"05615"}],
  ATL:[{name:"Barranquilla",dane:"08001"},{name:"Soledad",dane:"08675"},{name:"Malambo",dane:"08433"},{name:"Baranoa",dane:"08078"},{name:"Puerto Colombia",dane:"08573"}],
  BOG:[{name:"Bogotá D.C.",dane:"11001"}],
  BOL:[{name:"Cartagena",dane:"13001"},{name:"Magangué",dane:"13430"},{name:"Turbaco",dane:"13780"}],
  BOY:[{name:"Tunja",dane:"15001"},{name:"Duitama",dane:"15238"},{name:"Sogamoso",dane:"15693"}],
  CAL:[{name:"Manizales",dane:"17001"},{name:"La Dorada",dane:"17380"}],
  CAU:[{name:"Popayán",dane:"19001"},{name:"Santander de Quilichao",dane:"19698"}],
  CES:[{name:"Valledupar",dane:"20001"},{name:"Aguachica",dane:"20011"}],
  COR:[{name:"Montería",dane:"23001"},{name:"Lorica",dane:"23417"},{name:"Cereté",dane:"23162"}],
  CUN:[{name:"Soacha",dane:"25754"},{name:"Fusagasugá",dane:"25290"},{name:"Chía",dane:"25175"},{name:"Zipaquirá",dane:"25899"},{name:"Facatativá",dane:"25269"}],
  HUI:[{name:"Neiva",dane:"41001"},{name:"Pitalito",dane:"41503"}],
  LAG:[{name:"Riohacha",dane:"44001"},{name:"Maicao",dane:"44430"}],
  MAG:[{name:"Santa Marta",dane:"47001"},{name:"Ciénaga",dane:"47189"}],
  MET:[{name:"Villavicencio",dane:"50001"},{name:"Acacías",dane:"50006"}],
  NAR:[{name:"Pasto",dane:"52001"},{name:"Tumaco",dane:"52835"}],
  NSA:[{name:"Cúcuta",dane:"54001"},{name:"Ocaña",dane:"54518"}],
  QUI:[{name:"Armenia",dane:"63001"}],
  RIS:[{name:"Pereira",dane:"66001"},{name:"Dosquebradas",dane:"66170"}],
  SAN:[{name:"Bucaramanga",dane:"68001"},{name:"Floridablanca",dane:"68276"},{name:"Girón",dane:"68307"}],
  SUC:[{name:"Sincelejo",dane:"70001"},{name:"Corozal",dane:"70110"}],
  TOL:[{name:"Ibagué",dane:"73001"},{name:"Melgar",dane:"73449"}],
  VAC:[{name:"Cali",dane:"76001"},{name:"Buenaventura",dane:"76111"},{name:"Palmira",dane:"76520"},{name:"Tuluá",dane:"76834"}],
  SAP:[{name:"San Andrés",dane:"88001"}],
  AMA:[{name:"Leticia",dane:"91001"}],
  ARA:[{name:"Arauca",dane:"81001"}],
  CAQ:[{name:"Florencia",dane:"18001"}],
  CAS:[{name:"Yopal",dane:"85001"}],
  CHO:[{name:"Quibdó",dane:"27001"}],
  GUA:[{name:"Inírida",dane:"94001"}],
  GUV:[{name:"San José del Guaviare",dane:"95001"}],
  PUT:[{name:"Mocoa",dane:"86001"}],
  VAU:[{name:"Mitú",dane:"97001"}],
  VIC:[{name:"Puerto Carreño",dane:"99001"}],
};

// ── Tipos ─────────────────────────────────────────────────────────
type ObType  = "" | "pn" | "emp";
type ObStage = "tipo" | "form" | "success";

const PN_STEPS  = ["Identificación", "Contacto", "Actividad", "Documentos"];
const EMP_STEPS = ["Empresa", "Actividad", "Rep. Legal", "Documentos"];

// ── Estilos compartidos ───────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px",
  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
  background: "var(--bg)", color: "var(--t1)", fontSize: "13px", outline: "none",
  fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 600,
  color: "var(--t2)", marginBottom: "6px",
};
const sectionTitle = (text: string) => (
  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".6px", padding: "6px 0 10px", borderBottom: "1px solid var(--border)", marginTop: "6px", marginBottom: "14px" }}>
    {text}
  </div>
);

// ── Selector Depto / Ciudad ───────────────────────────────────────
interface GeoPickerProps {
  labelDep: string; labelCiu: string;
  dep: string; ciu: string;
  onDep: (v: string) => void; onCiu: (v: string) => void;
  hint?: string;
}
function GeoPicker({ labelDep, labelCiu, dep, ciu, onDep, onCiu, hint }: GeoPickerProps) {
  const cities = (CIUDADES[dep] ?? []).slice().sort((a,b) => a.name.localeCompare(b.name,"es"));
  const daneCode = cities.find(c => c.dane === ciu)?.dane ?? "";
  return (
    <>
      <div>
        <label style={labelStyle}>{labelDep}</label>
        <select value={dep} onChange={(e) => { onDep(e.target.value); onCiu(""); }} style={inputStyle}>
          <option value="">Selecciona...</option>
          {DEPARTAMENTOS.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>{labelCiu}</label>
        <select value={ciu} onChange={(e) => onCiu(e.target.value)} style={inputStyle} disabled={!dep}>
          <option value="">{dep ? "Selecciona ciudad..." : "Primero elige departamento"}</option>
          {cities.map(c => <option key={c.dane} value={c.dane}>{c.name} ({c.dane})</option>)}
        </select>
        {hint && daneCode && <div style={{ fontSize: "11px", color: "var(--success)", marginTop: "4px" }}>✓ DANE: {daneCode}</div>}
        {hint && !daneCode && <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>{hint}</div>}
      </div>
    </>
  );
}

// ── Zona de subida de archivo ─────────────────────────────────────
interface UploadZoneProps {
  label: string; hint: string; icon: string;
  done: boolean; onMark: () => void; span?: boolean;
}
function UploadZone({ label, hint, icon, done, onMark, span }: UploadZoneProps) {
  return (
    <div style={{ gridColumn: span ? "1/-1" : undefined }}>
      <label style={labelStyle}>{label} <span style={{ color: "var(--accent)" }}>*</span></label>
      <div
        onClick={onMark}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "90px", border: `1.5px dashed ${done ? "var(--success)" : "var(--border-strong)"}`, borderRadius: "var(--radius-sm)", background: done ? "var(--success-dim)" : "var(--elevated)", cursor: "pointer", padding: "16px", transition: ".14s", gap: "6px" }}
      >
        <i className={`ti ${done ? "ti-circle-check" : icon}`} style={{ fontSize: "22px", color: done ? "var(--success)" : "var(--t3)" }} />
        <div style={{ fontSize: "12px", fontWeight: 500, color: done ? "var(--success)" : "var(--t2)" }}>{done ? "Cargado" : "Subir archivo"}</div>
        {!done && <div style={{ fontSize: "11px", color: "var(--t3)" }}>{hint}</div>}
        {done && <div style={{ fontSize: "11px", color: "var(--success)" }}>✓ Listo</div>}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────
export const OnboardingView: React.FC<Props> = ({ onToast }) => {
  const [stage, setStage]   = useState<ObStage>("tipo");
  const [obType, setObType] = useState<ObType>("");
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Estado PN ──
  const [pn, setPn] = useState({
    docType:"", docNum:"", docFecha:"",
    expDep:"", expMun:"",
    pn1:"", pn2:"", pa1:"", pa2:"",
    fechaNac:"", nacDep:"", nacMun:"",
    email:"", cel:"", cel2:"",
    depRes:"", ciuRes:"",
    ocupacion:"", empresa:"", cargo:"", ingreso:"",
    origenFondos:"",
  });
  const [pnDocs, setPnDocs] = useState({ cedFront:false, cedBack:false, selfie:false, decOrigen:false });

  // ── Estado Empresa ──
  const [emp, setEmp] = useState({
    razon:"", nit:"", tipoSoc:"", fechaConst:"",
    depEmp:"", ciuEmp:"",
    email:"", tel:"", web:"",
    actEco:"", origenFondos:"",
    rlNombre:"", rlTipoDoc:"", rlNumDoc:"", rlFechaDoc:"",
    rlDepExp:"", rlMunExp:"",
    rlFechaNac:"", rlDepNac:"", rlMunNac:"",
    rlEmail:"", rlCel:"",
  });
  const [empDocs, setEmpDocs] = useState({ camCom:false, rut:false, cedFront:false, cedBack:false, decOrigen:false, estados:false, composicion:false });

  const pf = (k: keyof typeof pn) => (v: string) => setPn(p => ({...p, [k]: v}));
  const ef = (k: keyof typeof emp) => (v: string) => setEmp(p => ({...p, [k]: v}));
  const pd = (k: keyof typeof pnDocs) => () => setPnDocs(p => ({...p, [k]: true}));
  const ed = (k: keyof typeof empDocs) => () => setEmpDocs(p => ({...p, [k]: true}));

  const steps     = obType === "pn" ? PN_STEPS : EMP_STEPS;
  const totalSteps = steps.length;
  const fullName  = [pn.pn1, pn.pn2, pn.pa1, pn.pa2].filter(Boolean).join(" ");

  const handleStart = (type: "pn" | "emp") => {
    setObType(type); setStep(0); setStage("form");
  };

  const handleNext = async () => {
    if (step < totalSteps - 1) {
      setStep(s => s + 1);
    } else {
      // Último paso — enviar
      setSaving(true);
      try {
        if (obType === "pn") {
          const cities = CIUDADES[pn.depRes] ?? [];
          const daneCode = cities.find(c => c.dane === pn.ciuRes)?.dane ?? "11001";
          await registerBrebMerchant({
            mobile_number:   pn.cel,
            document_type:   pn.docType === "Cédula (CC)" ? "CC" : pn.docType === "Extranjería (CE)" ? "CE" : "PAS",
            document_number: pn.docNum,
            first_name:      pn.pn1,
            middle_name:     pn.pn2 || undefined,
            first_surname:   pn.pa1,
            middle_surname:  pn.pa2 || undefined,
            dane_code:       daneCode,
            commerce_name:   pn.empresa || fullName,
            email:           pn.email,
            gender:          "Masculino",
            address:         `Ciudad DANE ${daneCode}`,
            birth_place:     CIUDADES[pn.nacDep]?.[0]?.name ?? "Colombia",
            dob:             pn.fechaNac,
            issue_date:      pn.docFecha,
          });
        }
        onToast("ok", "Solicitud enviada", "El equipo de Ramplix revisará tu información");
        setStage("success");
      } catch (err: any) {
        onToast("error", "Error al enviar", err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleBack = () => {
    if (step === 0) { setStage("tipo"); setObType(""); }
    else setStep(s => s - 1);
  };

  const resetOb = () => { setStage("tipo"); setObType(""); setStep(0); };

  // ── Render pasos PN ───────────────────────────────────────────────
  const renderPnStep = () => {
    switch (step) {
      case 0: return (
        <>
          {sectionTitle("Identificación")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div><label style={labelStyle}>Tipo de documento <span style={{ color: "var(--accent)" }}>*</span> <RampTag /></label>
              <select value={pn.docType} onChange={e => pf("docType")(e.target.value)} style={inputStyle}>
                <option value="">Selecciona...</option>
                <option>Cédula (CC)</option><option>Extranjería (CE)</option><option>Pasaporte</option>
              </select>
            </div>
            <div><label style={labelStyle}>Número de documento <span style={{ color: "var(--accent)" }}>*</span> <RampTag /></label>
              <input value={pn.docNum} onChange={e => pf("docNum")(e.target.value)} placeholder="Ej. 1023456789" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Fecha de expedición <span style={{ color: "var(--accent)" }}>*</span> <RampTag /></label>
              <input type="date" value={pn.docFecha} onChange={e => pf("docFecha")(e.target.value)} style={inputStyle} />
            </div>
            <div />{/* espacio */}
            <GeoPicker labelDep="Departamento expedición *" labelCiu="Municipio expedición" dep={pn.expDep} ciu={pn.expMun} onDep={pf("expDep")} onCiu={pf("expMun")} />
          </div>
          {sectionTitle("Nombres y apellidos")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div><label style={labelStyle}>Primer nombre <span style={{ color: "var(--accent)" }}>*</span> <RampTag /></label>
              <input value={pn.pn1} onChange={e => pf("pn1")(e.target.value)} placeholder="Ej. Juan" style={inputStyle} maxLength={25} />
            </div>
            <div><label style={labelStyle}>Segundo nombre <RampTag /></label>
              <input value={pn.pn2} onChange={e => pf("pn2")(e.target.value)} placeholder="Ej. Carlos" style={inputStyle} maxLength={25} />
            </div>
            <div><label style={labelStyle}>Primer apellido <span style={{ color: "var(--accent)" }}>*</span> <RampTag /></label>
              <input value={pn.pa1} onChange={e => pf("pa1")(e.target.value)} placeholder="Ej. Gómez" style={inputStyle} maxLength={25} />
            </div>
            <div><label style={labelStyle}>Segundo apellido <RampTag /></label>
              <input value={pn.pa2} onChange={e => pf("pa2")(e.target.value)} placeholder="Ej. Pérez" style={inputStyle} maxLength={25} />
            </div>
            {fullName && (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Nombre completo (generado automáticamente)</label>
                <input value={fullName} readOnly style={{ ...inputStyle, background: "var(--elevated)", color: "var(--t2)" }} />
              </div>
            )}
          </div>
          {sectionTitle("Datos personales")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div><label style={labelStyle}>Fecha de nacimiento <span style={{ color: "var(--accent)" }}>*</span> <RampTag /></label>
              <input type="date" value={pn.fechaNac} onChange={e => pf("fechaNac")(e.target.value)} style={inputStyle} />
            </div>
            <div />{/* espacio */}
            <GeoPicker labelDep="Departamento nacimiento" labelCiu="Municipio nacimiento" dep={pn.nacDep} ciu={pn.nacMun} onDep={pf("nacDep")} onCiu={pf("nacMun")} />
          </div>
        </>
      );
      case 1: return (
        <>
          {sectionTitle("Información de contacto")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div><label style={labelStyle}>Correo electrónico <span style={{ color: "var(--accent)" }}>*</span></label>
              <input type="email" value={pn.email} onChange={e => pf("email")(e.target.value)} placeholder="correo@ejemplo.com" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Celular principal <span style={{ color: "var(--accent)" }}>*</span></label>
              <input value={pn.cel} onChange={e => pf("cel")(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="300 000 0000" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Celular alternativo</label>
              <input value={pn.cel2} onChange={e => pf("cel2")(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="300 000 0001" style={inputStyle} />
            </div>
          </div>
          {sectionTitle("Lugar de residencia")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <GeoPicker labelDep="Departamento *" labelCiu="Ciudad *" dep={pn.depRes} ciu={pn.ciuRes} onDep={pf("depRes")} onCiu={pf("ciuRes")} hint="Código DANE automático" />
          </div>
        </>
      );
      case 2: return (
        <>
          {sectionTitle("Actividad económica")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div><label style={labelStyle}>Ocupación <span style={{ color: "var(--accent)" }}>*</span></label>
              <select value={pn.ocupacion} onChange={e => pf("ocupacion")(e.target.value)} style={inputStyle}>
                <option value="">Selecciona...</option>
                <option>Empleado</option><option>Independiente / Emprendedor</option>
                <option>Comerciante</option><option>Pensionado</option>
                <option>Estudiante</option><option>Ama de casa</option><option>Otro</option>
              </select>
            </div>
            <div><label style={labelStyle}>Empresa / negocio</label>
              <input value={pn.empresa} onChange={e => pf("empresa")(e.target.value)} placeholder="Nombre de tu empresa o negocio" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Cargo</label>
              <input value={pn.cargo} onChange={e => pf("cargo")(e.target.value)} placeholder="Ej. Gerente, Asesor..." style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Rango de ingresos mensuales</label>
              <select value={pn.ingreso} onChange={e => pf("ingreso")(e.target.value)} style={inputStyle}>
                <option value="">Selecciona...</option>
                <option>Menos de $1.000.000</option><option>$1.000.000 – $3.000.000</option>
                <option>$3.000.001 – $8.000.000</option><option>Más de $8.000.000</option>
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Origen de fondos <span style={{ color: "var(--accent)" }}>*</span></label>
              <select value={pn.origenFondos} onChange={e => pf("origenFondos")(e.target.value)} style={inputStyle}>
                <option value="">Selecciona...</option>
                <option>Salario / Nómina</option><option>Actividad comercial</option>
                <option>Remesas</option><option>Ahorros</option>
                <option>Inversiones</option><option>Pensión</option><option>Otro</option>
              </select>
            </div>
          </div>
        </>
      );
      case 3: return (
        <>
          {sectionTitle("Documentos requeridos")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <UploadZone label="Cédula — Frente" hint="JPG o PNG · Parte frontal" icon="ti-id" done={pnDocs.cedFront} onMark={pd("cedFront")} />
            <UploadZone label="Cédula — Reverso" hint="JPG o PNG · Parte trasera" icon="ti-id" done={pnDocs.cedBack} onMark={pd("cedBack")} />
            <UploadZone label="Selfie con documento" hint="Foto sosteniendo tu cédula" icon="ti-camera" done={pnDocs.selfie} onMark={pd("selfie")} />
            <UploadZone label="Declaración de origen de fondos" hint="PDF firmado" icon="ti-writing" done={pnDocs.decOrigen} onMark={pd("decOrigen")} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "12px 0", fontSize: "12px", color: "var(--t2)" }}>
            <input type="checkbox" style={{ marginTop: "2px", flexShrink: 0 }} />
            <span>Declaro que la información suministrada y los documentos adjuntos son verídicos y autorizo a Ramplix para verificar los datos con fines de vinculación.</span>
          </div>
        </>
      );
      default: return null;
    }
  };

  // ── Render pasos Empresa ──────────────────────────────────────────
  const renderEmpStep = () => {
    switch (step) {
      case 0: return (
        <>
          {sectionTitle("Datos de la empresa")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Razón social <span style={{ color: "var(--accent)" }}>*</span></label>
              <input value={emp.razon} onChange={e => ef("razon")(e.target.value)} placeholder="Nombre legal de la empresa" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>NIT <span style={{ color: "var(--accent)" }}>*</span></label>
              <input value={emp.nit} onChange={e => ef("nit")(e.target.value)} placeholder="900.123.456-7" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Tipo de sociedad</label>
              <select value={emp.tipoSoc} onChange={e => ef("tipoSoc")(e.target.value)} style={inputStyle}>
                <option value="">Selecciona...</option>
                <option>S.A.S.</option><option>S.A.</option><option>Ltda.</option>
                <option>Persona Natural</option><option>Entidad sin ánimo de lucro</option><option>Otro</option>
              </select>
            </div>
            <div><label style={labelStyle}>Fecha de constitución</label>
              <input type="date" value={emp.fechaConst} onChange={e => ef("fechaConst")(e.target.value)} style={inputStyle} />
            </div>
            <div />{/* espacio */}
            <GeoPicker labelDep="Departamento *" labelCiu="Ciudad *" dep={emp.depEmp} ciu={emp.ciuEmp} onDep={ef("depEmp")} onCiu={ef("ciuEmp")} hint="Código DANE automático" />
            <div><label style={labelStyle}>Correo corporativo <span style={{ color: "var(--accent)" }}>*</span></label>
              <input type="email" value={emp.email} onChange={e => ef("email")(e.target.value)} placeholder="contacto@empresa.com" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Teléfono</label>
              <input value={emp.tel} onChange={e => ef("tel")(e.target.value)} placeholder="+57 300 000 0000" style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Sitio web (opcional)</label>
              <input value={emp.web} onChange={e => ef("web")(e.target.value)} placeholder="https://empresa.com" style={inputStyle} />
            </div>
          </div>
        </>
      );
      case 1: return (
        <>
          {sectionTitle("Actividad económica")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Actividad económica principal <span style={{ color: "var(--accent)" }}>*</span></label>
              <input value={emp.actEco} onChange={e => ef("actEco")(e.target.value)} placeholder="Ej. Comercio electrónico, cambio de divisas..." style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Origen de fondos <span style={{ color: "var(--accent)" }}>*</span></label>
              <select value={emp.origenFondos} onChange={e => ef("origenFondos")(e.target.value)} style={inputStyle}>
                <option value="">Selecciona...</option>
                <option>Ingresos operacionales</option><option>Ventas de productos/servicios</option>
                <option>Inversiones</option><option>Remesas</option><option>Otro</option>
              </select>
            </div>
          </div>
        </>
      );
      case 2: return (
        <>
          {sectionTitle("Datos del Representante Legal")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Nombre completo del RL <span style={{ color: "var(--accent)" }}>*</span></label>
              <input value={emp.rlNombre} onChange={e => ef("rlNombre")(e.target.value)} placeholder="Nombre y apellidos" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Tipo de documento <span style={{ color: "var(--accent)" }}>*</span></label>
              <select value={emp.rlTipoDoc} onChange={e => ef("rlTipoDoc")(e.target.value)} style={inputStyle}>
                <option value="">Selecciona...</option>
                <option>Cédula (CC)</option><option>Extranjería (CE)</option><option>Pasaporte</option>
              </select>
            </div>
            <div><label style={labelStyle}>Número de documento <span style={{ color: "var(--accent)" }}>*</span></label>
              <input value={emp.rlNumDoc} onChange={e => ef("rlNumDoc")(e.target.value)} placeholder="Ej. 1023456789" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Fecha de expedición <span style={{ color: "var(--accent)" }}>*</span></label>
              <input type="date" value={emp.rlFechaDoc} onChange={e => ef("rlFechaDoc")(e.target.value)} style={inputStyle} />
            </div>
            <div />{/* espacio */}
            <GeoPicker labelDep="Departamento expedición" labelCiu="Municipio expedición" dep={emp.rlDepExp} ciu={emp.rlMunExp} onDep={ef("rlDepExp")} onCiu={ef("rlMunExp")} />
            <div><label style={labelStyle}>Fecha de nacimiento <span style={{ color: "var(--accent)" }}>*</span></label>
              <input type="date" value={emp.rlFechaNac} onChange={e => ef("rlFechaNac")(e.target.value)} style={inputStyle} />
            </div>
            <div />{/* espacio */}
            <GeoPicker labelDep="Departamento nacimiento" labelCiu="Municipio nacimiento" dep={emp.rlDepNac} ciu={emp.rlMunNac} onDep={ef("rlDepNac")} onCiu={ef("rlMunNac")} />
            <div><label style={labelStyle}>Correo del RL</label>
              <input type="email" value={emp.rlEmail} onChange={e => ef("rlEmail")(e.target.value)} placeholder="rl@empresa.com" style={inputStyle} />
            </div>
            <div><label style={labelStyle}>Celular del RL</label>
              <input value={emp.rlCel} onChange={e => ef("rlCel")(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="300 000 0000" style={inputStyle} />
            </div>
          </div>
        </>
      );
      case 3: return (
        <>
          {sectionTitle("Documentos requeridos")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <UploadZone label="Cámara de comercio" hint="Vigente — no mayor a 30 días" icon="ti-building" done={empDocs.camCom} onMark={ed("camCom")} />
            <UploadZone label="RUT" hint="Registro Único Tributario actualizado" icon="ti-file-text" done={empDocs.rut} onMark={ed("rut")} />
            <UploadZone label="Cédula del RL — Frente" hint="JPG o PNG · Parte frontal" icon="ti-id" done={empDocs.cedFront} onMark={ed("cedFront")} />
            <UploadZone label="Cédula del RL — Reverso" hint="JPG o PNG · Parte trasera" icon="ti-id" done={empDocs.cedBack} onMark={ed("cedBack")} />
            <UploadZone label="Declaración de origen de fondos" hint="Carta firmada por el RL" icon="ti-writing" done={empDocs.decOrigen} onMark={ed("decOrigen")} />
            <UploadZone label="Estados financieros" hint="Balance general y resultados último año" icon="ti-chart-bar" done={empDocs.estados} onMark={ed("estados")} />
            <UploadZone label="Composición accionaria" hint="Listado de socios con % de participación" icon="ti-users" done={empDocs.composicion} onMark={ed("composicion")} span />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "12px 0", fontSize: "12px", color: "var(--t2)" }}>
            <input type="checkbox" style={{ marginTop: "2px", flexShrink: 0 }} />
            <span>Declaro que la información suministrada y los documentos adjuntos son verídicos y autorizo a Ramplix para verificar los datos con fines de vinculación.</span>
          </div>
        </>
      );
      default: return null;
    }
  };

  // ── Pantalla: selección de tipo ────────────────────────────────────
  if (stage === "tipo") {
    return (
      <div style={{ animation: "fadeUp .3s ease", maxWidth: "600px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "6px" }}>Bienvenido a Ramplix</h2>
          <p style={{ color: "var(--t2)", fontSize: "13.5px" }}>Selecciona cómo quieres registrarte</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", color: "var(--t1)" }}>
          {[
            { type: "pn" as const, icon: "ti-user", label: "Persona Natural", desc: "Soy una persona que desea acceder a los servicios de Ramplix en Colombia" },
            { type: "emp" as const, icon: "ti-building", label: "Empresa", desc: "Represento una empresa colombiana que quiere operar en Ramplix" },
          ].map((opt) => (
            <button
              key={opt.type}
              onClick={() => handleStart(opt.type)}
              style={{ padding: "28px 22px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", textAlign: "center", transition: ".14s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.background = "var(--accent-dim)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
            >
              <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "var(--accent-dim)", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "var(--accent)" }}>
                <i className={`ti ${opt.icon}`} style={{ fontSize: "24px" }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "8px", color: "var(--t1)" }}>{opt.label}</div>
              <div style={{ fontSize: "12.5px", color: "var(--t3)", lineHeight: 1.6 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Pantalla: éxito ────────────────────────────────────────────────
  if (stage === "success") {
    const solId = `OB-${new Date().getFullYear()}-${String(Math.floor(Math.random()*99999)).padStart(5,"0")}`;
    return (
      <div style={{ animation: "fadeUp .3s ease", maxWidth: "480px", margin: "0 auto", textAlign: "center", padding: "36px 16px" }}>
        <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 18px", fontSize: "28px" }}>
          <i className="ti ti-circle-check" />
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Solicitud enviada</h2>
        <p style={{ color: "var(--t2)", fontSize: "13.5px", lineHeight: 1.7, marginBottom: "22px", maxWidth: "360px", margin: "0 auto 22px" }}>
          Tu información fue recibida. El equipo de Ramplix revisará tu solicitud en <strong>1 a 3 días hábiles</strong>. Una vez aprobado, podrás acceder a todas las funciones del portal desde <strong>Mis billeteras</strong>.
        </p>
        <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px", maxWidth: "300px", margin: "0 auto 22px" }}>
          {[
            ["Estado", <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, color: "var(--warning)", background: "var(--warning-dim)" }}>⏳ En revisión</span>],
            ["Solicitud", <code style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>{solId}</code>],
            ["Siguiente paso", "Revisión por el equipo Ramplix"],
          ].map(([k, v], i, arr) => (
            <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", fontSize: "12.5px" }}>
              <span style={{ color: "var(--t3)" }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
        <button
          onClick={resetOb}
          style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "10px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
        >
          <i className="ti ti-refresh" />Nuevo registro
        </button>
      </div>
    );
  }

  // ── Pantalla: formulario ───────────────────────────────────────────
  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Badge tipo + cambiar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 500, background: "var(--accent-dim)", color: "var(--accent)" }}>
          <i className={`ti ${obType === "pn" ? "ti-user" : "ti-building"}`} />
          {obType === "pn" ? "Persona Natural" : "Empresa"}
        </span>
        <button
          onClick={() => { setStage("tipo"); setObType(""); setStep(0); }}
          style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "11px", cursor: "pointer" }}
        >
          <i className="ti ti-arrows-exchange" />Cambiar tipo
        </button>
      </div>

      {/* Stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: "0", marginBottom: "22px" }}>
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", flex: i < steps.length - 1 ? undefined : undefined }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, fontSize: i < step ? "14px" : "12px", flexShrink: 0, background: i < step ? "var(--success)" : i === step ? "var(--accent)" : "var(--elevated)", color: i < step ? "#fff" : i === step ? "#fff" : "var(--t3)", border: `2px solid ${i < step ? "var(--success)" : i === step ? "var(--accent)" : "var(--border)"}` }}>
                {i < step ? <i className="ti ti-check" style={{ fontSize: "13px" }} /> : i + 1}
              </div>
              <div style={{ fontSize: "10.5px", fontWeight: i === step ? 600 : 400, color: i === step ? "var(--accent)" : i < step ? "var(--success)" : "var(--t3)", whiteSpace: "nowrap" }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ height: "2px", flex: 1, background: i < step ? "var(--success)" : "var(--border)", margin: "0 4px", marginBottom: "22px" }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Formulario */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "22px 24px", boxShadow: "var(--shadow)", marginBottom: "16px" }}>
        {obType === "pn" ? renderPnStep() : renderEmpStep()}
      </div>

      {/* Navegación */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={handleBack}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
        >
          <i className="ti ti-arrow-left" />Atrás
        </button>
        <span style={{ fontSize: "12px", color: "var(--t3)" }}>Paso {step + 1} de {totalSteps}</span>
        <button
          onClick={handleNext}
          disabled={saving}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Enviando…" : step === totalSteps - 1 ? (
            <><i className="ti ti-send" />Enviar solicitud</>
          ) : (
            <>Siguiente<i className="ti ti-arrow-right" /></>
          )}
        </button>
      </div>
    </div>
  );
};

// ── Tag ⚡Ramplix ─────────────────────────────────────────────────
function RampTag() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", padding: "1px 5px", borderRadius: "4px", fontSize: "9px", fontWeight: 600, background: "var(--accent-dim)", color: "var(--accent)", marginLeft: "4px", verticalAlign: "middle" }}>
      ⚡Ramplix
    </span>
  );
}