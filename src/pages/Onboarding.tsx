// src/pages/Onboarding.tsx
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { submitOnboardingPN, submitOnboardingEmp, getOnboardingStatus } from "../lib/bepayClient";
import type { ToastType } from "../types";

interface Props {
  onToast: (type: ToastType, title: string, msg: string) => void;
}

// ── Tipos geográficos ─────────────────────────────────────────────
interface BepayRegion { id: number; name: string; code: string; }
interface BepayCity   { id: number; name: string; region_id: number; dane_code?: string; }

// ── Diccionario DANE por nombre de ciudad ─────────────────────────
const DANE_BY_CITY: Record<string, string> = {
  "Bogotá D.C.":"11001","Medellín":"05001","Barranquilla":"08001","Cali":"76001",
  "Cartagena":"13001","Bucaramanga":"68001","Soledad":"08675","Cúcuta":"54001",
  "Ibagué":"73001","Pereira":"66001","Santa Marta":"47001","Manizales":"17001",
  "Neiva":"41001","Villavicencio":"50001","Armenia":"63001","Valledupar":"20001",
  "Montería":"23001","Pasto":"52001","Sincelejo":"70001","Popayán":"19001",
  "Floridablanca":"68276","Envigado":"05266","Soacha":"25754","Bello":"05088",
  "Buenaventura":"76111","Itagüí":"05360","Dosquebradas":"66170","Palmira":"76520",
  "Tunja":"15001","Rionegro":"05615","Malambo":"08433","Baranoa":"08078",
  "Puerto Colombia":"08573","Magangué":"13430","Turbaco":"13780","Duitama":"15238",
  "Sogamoso":"15693","La Dorada":"17380","Santander de Quilichao":"19698",
  "Aguachica":"20011","Lorica":"23417","Cereté":"23162","Fusagasugá":"25290",
  "Chía":"25175","Zipaquirá":"25899","Facatativá":"25269","Pitalito":"41503",
  "Riohacha":"44001","Maicao":"44430","Ciénaga":"47189","Acacías":"50006",
  "Tumaco":"52835","Ocaña":"54518","Girón":"68307","Corozal":"70110",
  "Melgar":"73449","Tuluá":"76834","San Andrés":"88001","Leticia":"91001",
  "Arauca":"81001","Florencia":"18001","Yopal":"85001","Quibdó":"27001",
  "Inírida":"94001","San José del Guaviare":"95001","Mocoa":"86001",
  "Mitú":"97001","Puerto Carreño":"99001",
};

function getDane(cityName: string): string {
  return DANE_BY_CITY[cityName] ?? "";
}

// ── Hook para cargar geografía desde Bepay + caché ────────────────
function useGeo() {
  const [regions, setRegions] = useState<BepayRegion[]>([]);
  const [cities,  setCities]  = useState<BepayCity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadGeo(); }, []);

  const loadGeo = async () => {
    setLoading(true);
    try {
      // 1. Intentar desde caché en Supabase
      const { data: cached } = await supabase
        .from("geo_cache")
        .select("data, updated_at")
        .eq("key", "colombia_geo")
        .single();

      if (cached) {
        const age = Date.now() - new Date(cached.updated_at).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          const geo = cached.data as { regions: BepayRegion[]; cities: BepayCity[] };
          setRegions(geo.regions.sort((a, b) => a.name.localeCompare(b.name, "es")));
          setCities(geo.cities.map(c => ({ ...c, dane_code: getDane(c.name) })));
          setLoading(false);
          return;
        }
      }

      // 2. Llamar a Bepay via Edge Function
      const { data, error } = await supabase.functions.invoke("bepay-charges", {
        body: { action: "get_colombia_geo", payload: {} },
      });

      if (error || !data?.success) throw new Error("Error geo");

      const geo = data.data as { regions: BepayRegion[]; cities: BepayCity[] };
      setRegions(geo.regions.sort((a, b) => a.name.localeCompare(b.name, "es")));
      setCities(geo.cities.map(c => ({ ...c, dane_code: getDane(c.name) })));
    } catch {
      // Fallback silencioso — usará listas vacías
    } finally {
      setLoading(false);
    }
  };

  const getCitiesByRegion = (regionId: number) =>
    cities.filter(c => c.region_id === regionId)
          .slice().sort((a, b) => a.name.localeCompare(b.name, "es"));

  return { regions, cities, getCitiesByRegion, loading };
}

// ── Tipos ─────────────────────────────────────────────────────────
type ObType  = "" | "pn" | "emp";
type ObStage = "checking" | "tipo" | "form" | "success";

const PN_STEPS  = ["Identificación", "Contacto", "Actividad", "Documentos"];
const EMP_STEPS = ["Empresa", "Actividad", "Rep. Legal", "Documentos"];

// ── Estilos base ──────────────────────────────────────────────────
const IS: React.CSSProperties = {
  width:"100%", padding:"9px 11px",
  border:"1px solid var(--border)", borderRadius:"var(--radius-sm)",
  background:"var(--bg)", color:"var(--t1)", fontSize:"13px",
  outline:"none", fontFamily:"inherit",
};
const LS: React.CSSProperties = {
  display:"block", fontSize:"12px", fontWeight:600,
  color:"var(--t2)", marginBottom:"6px",
};

function SecTitle({ text }: { text: string }) {
  return (
    <div style={{ fontSize:"11px", fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".6px", padding:"6px 0 10px", borderBottom:"1px solid var(--border)", marginTop:"6px", marginBottom:"14px" }}>
      {text}
    </div>
  );
}

// ── GeoPicker que consume la API de Bepay ─────────────────────────
interface GeoPickerProps {
  labelDep: string;
  labelCiu: string;
  depId:  string;
  ciuId:  string;
  onDep:  (regionId: string) => void;
  onCiu:  (cityId: string, dane: string, cityName: string) => void;
  hint?:  boolean;
  regions: BepayRegion[];
  getCitiesByRegion: (regionId: number) => BepayCity[];
  geoLoading: boolean;
}

function GeoPicker({ labelDep, labelCiu, depId, ciuId, onDep, onCiu, hint, regions, getCitiesByRegion, geoLoading }: GeoPickerProps) {
  const regionId   = parseInt(depId) || 0;
  const cityList   = regionId ? getCitiesByRegion(regionId) : [];
  const selectedCity = cityList.find(c => String(c.id) === ciuId);
  const dane       = selectedCity?.dane_code ?? "";

  return (
    <>
      <div>
        <label style={LS}>{labelDep}</label>
        <select value={depId} onChange={e => { onDep(e.target.value); onCiu("", "", ""); }} style={IS} disabled={geoLoading}>
          <option value="">{geoLoading ? "Cargando…" : "Selecciona…"}</option>
          {regions.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
        </select>
      </div>
      <div>
        <label style={LS}>{labelCiu}</label>
        <select
          value={ciuId}
          onChange={e => {
            const city = cityList.find(c => String(c.id) === e.target.value);
            onCiu(e.target.value, city?.dane_code ?? "", city?.name ?? "");
          }}
          style={IS}
          disabled={!depId || geoLoading}
        >
          <option value="">{depId ? "Selecciona ciudad…" : "Primero elige departamento"}</option>
          {cityList.map(c => (
            <option key={c.id} value={String(c.id)}>
              {c.name}{c.dane_code ? ` (${c.dane_code})` : ""}
            </option>
          ))}
        </select>
        {hint && dane && (
          <div style={{ fontSize:"11px", color:"var(--success)", marginTop:"4px" }}>✓ DANE: {dane}</div>
        )}
        {hint && !dane && depId && (
          <div style={{ fontSize:"11px", color:"var(--t3)", marginTop:"4px" }}>Selecciona una ciudad</div>
        )}
      </div>
    </>
  );
}

// ── Upload state ──────────────────────────────────────────────────
interface UploadState { file: File | null; url: string | null; uploading: boolean; done: boolean; }

function UploadZone({ label, hint, icon, state, onChange, span }: {
  label: string; hint: string; icon: string;
  state: UploadState; onChange: (s: UploadState) => void; span?: boolean;
}) {
  const handleClick = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,application/pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { alert("Máximo 10MB"); return; }
      onChange({ file, url: null, uploading: true, done: false });
      try {
        const ext     = file.name.split(".").pop() ?? "jpg";
        const docType = label.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
        const { data: { user } } = await supabase.auth.getUser();
        const path = `${user?.id}/${docType}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from("onboarding-docs")
          .upload(path, file, { contentType: file.type, upsert: true });
        if (error) throw new Error(error.message);
        onChange({ file, url: path, uploading: false, done: true });
      } catch (err: any) {
        alert(`Error al subir: ${err.message}`);
        onChange({ file: null, url: null, uploading: false, done: false });
      }
    };
    input.click();
  };

  return (
    <div style={{ gridColumn: span ? "1/-1" : undefined }}>
      <label style={LS}>{label} <span style={{ color:"var(--accent)" }}>*</span></label>
      <div onClick={handleClick} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"90px", border:`1.5px dashed ${state.done ? "var(--success)" : state.uploading ? "var(--accent)" : "var(--border-strong)"}`, borderRadius:"var(--radius-sm)", background: state.done ? "var(--success-dim)" : state.uploading ? "var(--accent-dim)" : "var(--elevated)", cursor: state.uploading ? "wait" : "pointer", padding:"16px", transition:".14s", gap:"6px" }}>
        {state.uploading ? (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation:"spin 1s linear infinite", color:"var(--accent)" }}>
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
            <div style={{ fontSize:"12px", color:"var(--accent)", fontWeight:500 }}>Subiendo...</div>
          </>
        ) : state.done ? (
          <>
            <i className="ti ti-circle-check" style={{ fontSize:"22px", color:"var(--success)" }} />
            <div style={{ fontSize:"12px", fontWeight:500, color:"var(--success)" }}>{state.file?.name ?? "Cargado"}</div>
            <div style={{ fontSize:"11px", color:"var(--success)" }}>✓ Listo · clic para cambiar</div>
          </>
        ) : (
          <>
            <i className={`ti ${icon}`} style={{ fontSize:"22px", color:"var(--t3)" }} />
            <div style={{ fontSize:"12px", fontWeight:500, color:"var(--t2)" }}>Subir archivo</div>
            <div style={{ fontSize:"11px", color:"var(--t3)" }}>{hint}</div>
          </>
        )}
      </div>
    </div>
  );
}

function RampTag() {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"1px 5px", borderRadius:"4px", fontSize:"9px", fontWeight:600, background:"var(--accent-dim)", color:"var(--accent)", marginLeft:"4px", verticalAlign:"middle" }}>
      ⚡Ramplix
    </span>
  );
}

// ── Componente principal ──────────────────────────────────────────
export const OnboardingView: React.FC<Props> = ({ onToast }) => {
  const [stage,  setStage]  = useState<ObStage>("checking");
  const [obType, setObType] = useState<ObType>("");
  const [step,   setStep]   = useState(0);
  const [saving, setSaving] = useState(false);
  const [solId,  setSolId]  = useState("");
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted]   = useState(false);

  // Geografía desde Bepay
  const { regions, getCitiesByRegion, loading: geoLoading } = useGeo();

  // ── Estado PN ─────────────────────────────────────────────────
  const [pn, setPn] = useState({
    docType:"", docNum:"", docFecha:"",
    expDepId:"", expMunId:"", expMunDane:"", expMunName:"",
    pn1:"", pn2:"", pa1:"", pa2:"",
    fechaNac:"",
    nacDepId:"", nacMunId:"", nacMunDane:"", nacMunName:"",
    email:"", cel:"", cel2:"",
    depResId:"", ciuResId:"", ciuResDane:"", ciuResName:"",
    ocupacion:"", empresa:"", cargo:"", ingreso:"",
    origenFondos:"",
  });

  const [pnDocs, setPnDocs] = useState<Record<string, UploadState>>({
    cedFront:  { file:null, url:null, uploading:false, done:false },
    cedBack:   { file:null, url:null, uploading:false, done:false },
    selfie:    { file:null, url:null, uploading:false, done:false },
    decOrigen: { file:null, url:null, uploading:false, done:false },
  });

  // ── Estado Empresa ────────────────────────────────────────────
  const [emp, setEmp] = useState({
    razon:"", nit:"", tipoSoc:"", fechaConst:"",
    depEmpId:"", ciuEmpId:"", ciuEmpDane:"", ciuEmpName:"",
    email:"", tel:"", web:"",
    actEco:"", origenFondos:"",
    rlNombre:"", rlTipoDoc:"", rlNumDoc:"", rlFechaDoc:"",
    rlDepExpId:"", rlMunExpId:"", rlMunExpDane:"", rlMunExpName:"",
    rlFechaNac:"",
    rlDepNacId:"", rlMunNacId:"", rlMunNacDane:"", rlMunNacName:"",
    rlEmail:"", rlCel:"",
  });

  const [empDocs, setEmpDocs] = useState<Record<string, UploadState>>({
    camCom:      { file:null, url:null, uploading:false, done:false },
    rut:         { file:null, url:null, uploading:false, done:false },
    cedFront:    { file:null, url:null, uploading:false, done:false },
    cedBack:     { file:null, url:null, uploading:false, done:false },
    decOrigen:   { file:null, url:null, uploading:false, done:false },
    estados:     { file:null, url:null, uploading:false, done:false },
    composicion: { file:null, url:null, uploading:false, done:false },
  });

  const pf = (k: keyof typeof pn) => (v: string) => setPn(p => ({ ...p, [k]: v }));
  const ef = (k: keyof typeof emp) => (v: string) => setEmp(p => ({ ...p, [k]: v }));
  const pd = (k: string) => (s: UploadState) => setPnDocs(p => ({ ...p, [k]: s }));
  const ed = (k: string) => (s: UploadState) => setEmpDocs(p => ({ ...p, [k]: s }));

  const fullName = [pn.pn1, pn.pn2, pn.pa1, pn.pa2].filter(Boolean).join(" ");
  const steps    = obType === "pn" ? PN_STEPS : EMP_STEPS;

  // ── Verificar estado existente ────────────────────────────────
  const checkStatus = async () => {
  setStage("checking");
  try {
    const res = await getOnboardingStatus();
    const existing = res?.pn ?? res?.emp;
    if (existing) {
      setExistingStatus(existing.status);
      if (existing.status === "approved") {
        setStage("success");
        setSolId(existing.id?.slice(0, 12).toUpperCase() ?? "");
      } else {
        setStage("tipo");
      }
    } else {
      setStage("tipo");
    }
  } catch { setStage("tipo"); }
};

// 2. Luego el useEffect que la usa
useEffect(() => {
  checkStatus();

  const chPn = supabase.channel("ob-pn-status")
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"onboarding_pn" }, () => checkStatus())
    .subscribe();

  const chEmp = supabase.channel("ob-emp-status")
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"onboarding_emp" }, () => checkStatus())
    .subscribe();

  return () => {
    supabase.removeChannel(chPn);
    supabase.removeChannel(chEmp);
  };
}, []);

  const handleStart = (type: "pn" | "emp") => {
    setObType(type); setStep(0); setStage("form"); setTermsAccepted(false);
  };

  const handleNext = async () => {
    if (step < steps.length - 1) { setStep(s => s + 1); return; }
    if (!termsAccepted) { onToast("error", "Términos requeridos", "Debes aceptar los términos"); return; }

    setSaving(true);
    try {
      let res;
      if (obType === "pn") {
        res = await submitOnboardingPN({
          doc_type:        pn.docType === "Cédula (CC)" ? "CC" : pn.docType === "Extranjería (CE)" ? "CE" : "PAS",
          doc_number:      pn.docNum,
          doc_issue_date:  pn.docFecha,
          doc_issue_dep:   pn.expDepId,
          doc_issue_mun:   pn.expMunName,
          first_name:      pn.pn1,
          middle_name:     pn.pn2 || undefined,
          first_surname:   pn.pa1,
          middle_surname:  pn.pa2 || undefined,
          date_of_birth:   pn.fechaNac,
          birth_dep:       pn.nacDepId,
          birth_mun:       pn.nacMunName,
          birth_dane:      pn.nacMunDane,
          email:           pn.email,
          phone:           pn.cel,
          phone_alt:       pn.cel2 || undefined,
          res_dep:         pn.depResId,
          res_mun:         pn.ciuResName,
          res_dane:        pn.ciuResDane,
          address:         `Ciudad DANE ${pn.ciuResDane}`,
          occupation:      pn.ocupacion,
          company:         pn.empresa,
          job_title:       pn.cargo,
          income_range:    pn.ingreso,
          funds_origin:    pn.origenFondos,
          gender:          "Masculino",
          doc_front_url:   pnDocs.cedFront.url,
          doc_back_url:    pnDocs.cedBack.url,
          selfie_url:      pnDocs.selfie.url,
          funds_decl_url:  pnDocs.decOrigen.url,
          terms_accepted:  true,
        });
      } else {
        res = await submitOnboardingEmp({
          business_name:       emp.razon,
          nit:                 emp.nit,
          business_type:       emp.tipoSoc,
          incorporation_date:  emp.fechaConst || undefined,
          department:          emp.depEmpId,
          city:                emp.ciuEmpName,
          dane_code:           emp.ciuEmpDane,
          email:               emp.email,
          phone:               emp.tel,
          website:             emp.web,
          economic_activity:   emp.actEco,
          funds_origin:        emp.origenFondos,
          rl_full_name:        emp.rlNombre,
          rl_doc_type:         emp.rlTipoDoc === "Cédula (CC)" ? "CC" : "CE",
          rl_doc_number:       emp.rlNumDoc,
          rl_doc_issue_date:   emp.rlFechaDoc || undefined,
          rl_doc_issue_dep:    emp.rlDepExpId,
          rl_doc_issue_mun:    emp.rlMunExpName,
          rl_date_of_birth:    emp.rlFechaNac || undefined,
          rl_birth_dep:        emp.rlDepNacId,
          rl_birth_mun:        emp.rlMunNacName,
          rl_email:            emp.rlEmail,
          rl_phone:            emp.rlCel,
          chamber_commerce_url: empDocs.camCom.url,
          rut_url:              empDocs.rut.url,
          rl_doc_front_url:     empDocs.cedFront.url,
          rl_doc_back_url:      empDocs.cedBack.url,
          funds_decl_url:       empDocs.decOrigen.url,
          financial_states_url: empDocs.estados.url,
          shareholder_comp_url: empDocs.composicion.url,
          terms_accepted:       true,
        });
      }

      if (res?.success === false) {
        onToast("error", "Error al enviar", res.error ?? "Inténtalo de nuevo");
        return;
      }

      const id = `OB-${new Date().getFullYear()}-${String(Math.floor(Math.random()*99999)).padStart(5,"0")}`;
      setSolId(res?.id?.slice(0,8).toUpperCase() ?? id);
      onToast("ok", "Solicitud enviada", "El equipo de Ramplix revisará tu información");
      setStage("success");
    } catch (err: any) {
      onToast("error", "Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 0) { setStage("tipo"); setObType(""); }
    else setStep(s => s - 1);
  };

  // ── Pasos PN ─────────────────────────────────────────────────
  const renderPnStep = () => {
    switch (step) {
      case 0: return (
        <>
          <SecTitle text="Identificación" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div><label style={LS}>Tipo de documento <span style={{color:"var(--accent)"}}>*</span> <RampTag /></label>
              <select value={pn.docType} onChange={e => pf("docType")(e.target.value)} style={IS}>
                <option value="">Selecciona...</option>
                <option>Cédula (CC)</option><option>Extranjería (CE)</option><option>Pasaporte</option>
              </select>
            </div>
            <div><label style={LS}>Número de documento <span style={{color:"var(--accent)"}}>*</span> <RampTag /></label>
              <input value={pn.docNum} onChange={e => pf("docNum")(e.target.value)} placeholder="Ej. 1023456789" style={IS} />
            </div>
            <div><label style={LS}>Fecha de expedición <span style={{color:"var(--accent)"}}>*</span> <RampTag /></label>
              <input type="date" value={pn.docFecha} onChange={e => pf("docFecha")(e.target.value)} style={IS} />
            </div>
            <div />
            <GeoPicker
              labelDep="Departamento expedición *" labelCiu="Municipio expedición"
              depId={pn.expDepId} ciuId={pn.expMunId}
              onDep={v => setPn(p => ({ ...p, expDepId:v, expMunId:"", expMunDane:"", expMunName:"" }))}
              onCiu={(id, dane, name) => setPn(p => ({ ...p, expMunId:id, expMunDane:dane, expMunName:name }))}
              regions={regions} getCitiesByRegion={getCitiesByRegion} geoLoading={geoLoading}
            />
          </div>

          <SecTitle text="Nombres y apellidos" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div><label style={LS}>Primer nombre <span style={{color:"var(--accent)"}}>*</span> <RampTag /></label>
              <input value={pn.pn1} onChange={e => pf("pn1")(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g,""))} placeholder="Ej. Juan" style={IS} maxLength={25} />
            </div>
            <div><label style={LS}>Segundo nombre <RampTag /></label>
              <input value={pn.pn2} onChange={e => pf("pn2")(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g,""))} placeholder="Opcional" style={IS} maxLength={25} />
            </div>
            <div><label style={LS}>Primer apellido <span style={{color:"var(--accent)"}}>*</span> <RampTag /></label>
              <input value={pn.pa1} onChange={e => pf("pa1")(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g,""))} placeholder="Ej. Gómez" style={IS} maxLength={25} />
            </div>
            <div><label style={LS}>Segundo apellido <RampTag /></label>
              <input value={pn.pa2} onChange={e => pf("pa2")(e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g,""))} placeholder="Opcional" style={IS} maxLength={25} />
            </div>
            {fullName && (
              <div style={{ gridColumn:"1/-1" }}>
                <label style={LS}>Nombre completo (generado automáticamente)</label>
                <input value={fullName} readOnly style={{ ...IS, background:"var(--elevated)", color:"var(--t2)" }} />
              </div>
            )}
          </div>

          <SecTitle text="Datos personales" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div><label style={LS}>Fecha de nacimiento <span style={{color:"var(--accent)"}}>*</span> <RampTag /></label>
              <input type="date" value={pn.fechaNac} onChange={e => pf("fechaNac")(e.target.value)} style={IS} />
            </div>
            <div />
            <GeoPicker
              labelDep="Departamento nacimiento" labelCiu="Municipio nacimiento"
              depId={pn.nacDepId} ciuId={pn.nacMunId}
              onDep={v => setPn(p => ({ ...p, nacDepId:v, nacMunId:"", nacMunDane:"", nacMunName:"" }))}
              onCiu={(id, dane, name) => setPn(p => ({ ...p, nacMunId:id, nacMunDane:dane, nacMunName:name }))}
              regions={regions} getCitiesByRegion={getCitiesByRegion} geoLoading={geoLoading}
            />
          </div>
        </>
      );

      case 1: return (
        <>
          <SecTitle text="Información de contacto" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div><label style={LS}>Correo electrónico <span style={{color:"var(--accent)"}}>*</span></label>
              <input type="email" value={pn.email} onChange={e => pf("email")(e.target.value)} placeholder="correo@ejemplo.com" style={IS} />
            </div>
            <div><label style={LS}>Celular principal <span style={{color:"var(--accent)"}}>*</span></label>
              <input value={pn.cel} onChange={e => pf("cel")(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="300 000 0000" style={IS} />
            </div>
            <div><label style={LS}>Celular alternativo</label>
              <input value={pn.cel2} onChange={e => pf("cel2")(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="Opcional" style={IS} />
            </div>
          </div>
          <SecTitle text="Lugar de residencia" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <GeoPicker
              labelDep="Departamento *" labelCiu="Ciudad *"
              depId={pn.depResId} ciuId={pn.ciuResId}
              onDep={v => setPn(p => ({ ...p, depResId:v, ciuResId:"", ciuResDane:"", ciuResName:"" }))}
              onCiu={(id, dane, name) => setPn(p => ({ ...p, ciuResId:id, ciuResDane:dane, ciuResName:name }))}
              hint regions={regions} getCitiesByRegion={getCitiesByRegion} geoLoading={geoLoading}
            />
          </div>
        </>
      );

      case 2: return (
        <>
          <SecTitle text="Actividad económica" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div><label style={LS}>Ocupación <span style={{color:"var(--accent)"}}>*</span></label>
              <select value={pn.ocupacion} onChange={e => pf("ocupacion")(e.target.value)} style={IS}>
                <option value="">Selecciona...</option>
                <option>Empleado</option><option>Independiente / Emprendedor</option>
                <option>Comerciante</option><option>Pensionado</option>
                <option>Estudiante</option><option>Ama de casa</option><option>Otro</option>
              </select>
            </div>
            <div><label style={LS}>Empresa / negocio</label>
              <input value={pn.empresa} onChange={e => pf("empresa")(e.target.value)} placeholder="Nombre de tu empresa" style={IS} />
            </div>
            <div><label style={LS}>Cargo</label>
              <input value={pn.cargo} onChange={e => pf("cargo")(e.target.value)} placeholder="Ej. Gerente, Asesor..." style={IS} />
            </div>
            <div><label style={LS}>Rango de ingresos mensuales</label>
              <select value={pn.ingreso} onChange={e => pf("ingreso")(e.target.value)} style={IS}>
                <option value="">Selecciona...</option>
                <option>Menos de $1.000.000</option><option>$1.000.000 – $3.000.000</option>
                <option>$3.000.001 – $8.000.000</option><option>Más de $8.000.000</option>
              </select>
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={LS}>Origen de fondos <span style={{color:"var(--accent)"}}>*</span></label>
              <select value={pn.origenFondos} onChange={e => pf("origenFondos")(e.target.value)} style={IS}>
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
          <SecTitle text="Documentos requeridos" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <UploadZone label="Cédula — Frente"                hint="JPG o PNG · Parte frontal"    icon="ti-id"      state={pnDocs.cedFront}  onChange={pd("cedFront")} />
            <UploadZone label="Cédula — Reverso"               hint="JPG o PNG · Parte trasera"    icon="ti-id"      state={pnDocs.cedBack}   onChange={pd("cedBack")} />
            <UploadZone label="Selfie con documento"           hint="Foto sosteniendo tu cédula"  icon="ti-camera"  state={pnDocs.selfie}    onChange={pd("selfie")} />
            <UploadZone label="Declaración de origen de fondos" hint="PDF firmado"                 icon="ti-writing" state={pnDocs.decOrigen} onChange={pd("decOrigen")} />
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"8px", padding:"12px 0", fontSize:"12px", color:"var(--t2)" }}>
            <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ marginTop:"2px", flexShrink:0 }} />
            <span>Declaro que la información suministrada y los documentos adjuntos son verídicos y autorizo a Ramplix para verificar los datos con fines de vinculación.</span>
          </div>
        </>
      );

      default: return null;
    }
  };

  // ── Pasos Empresa ─────────────────────────────────────────────
  const renderEmpStep = () => {
    switch (step) {
      case 0: return (
        <>
          <SecTitle text="Datos de la empresa" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Razón social <span style={{color:"var(--accent)"}}>*</span></label>
              <input value={emp.razon} onChange={e => ef("razon")(e.target.value)} placeholder="Nombre legal de la empresa" style={IS} />
            </div>
            <div><label style={LS}>NIT <span style={{color:"var(--accent)"}}>*</span></label>
              <input value={emp.nit} onChange={e => ef("nit")(e.target.value)} placeholder="900.123.456-7" style={IS} />
            </div>
            <div><label style={LS}>Tipo de sociedad</label>
              <select value={emp.tipoSoc} onChange={e => ef("tipoSoc")(e.target.value)} style={IS}>
                <option value="">Selecciona...</option>
                <option>S.A.S.</option><option>S.A.</option><option>Ltda.</option>
                <option>Persona Natural</option><option>Entidad sin ánimo de lucro</option><option>Otro</option>
              </select>
            </div>
            <div><label style={LS}>Fecha de constitución</label>
              <input type="date" value={emp.fechaConst} onChange={e => ef("fechaConst")(e.target.value)} style={IS} />
            </div>
            <div />
            <GeoPicker
              labelDep="Departamento *" labelCiu="Ciudad *"
              depId={emp.depEmpId} ciuId={emp.ciuEmpId}
              onDep={v => setEmp(p => ({ ...p, depEmpId:v, ciuEmpId:"", ciuEmpDane:"", ciuEmpName:"" }))}
              onCiu={(id, dane, name) => setEmp(p => ({ ...p, ciuEmpId:id, ciuEmpDane:dane, ciuEmpName:name }))}
              hint regions={regions} getCitiesByRegion={getCitiesByRegion} geoLoading={geoLoading}
            />
            <div><label style={LS}>Correo corporativo <span style={{color:"var(--accent)"}}>*</span></label>
              <input type="email" value={emp.email} onChange={e => ef("email")(e.target.value)} placeholder="contacto@empresa.com" style={IS} />
            </div>
            <div><label style={LS}>Teléfono</label>
              <input value={emp.tel} onChange={e => ef("tel")(e.target.value)} placeholder="+57 300 000 0000" style={IS} />
            </div>
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Sitio web (opcional)</label>
              <input value={emp.web} onChange={e => ef("web")(e.target.value)} placeholder="https://empresa.com" style={IS} />
            </div>
          </div>
        </>
      );

      case 1: return (
        <>
          <SecTitle text="Actividad económica" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Actividad económica principal <span style={{color:"var(--accent)"}}>*</span></label>
              <input value={emp.actEco} onChange={e => ef("actEco")(e.target.value)} placeholder="Ej. Comercio electrónico, cambio de divisas..." style={IS} />
            </div>
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Origen de fondos <span style={{color:"var(--accent)"}}>*</span></label>
              <select value={emp.origenFondos} onChange={e => ef("origenFondos")(e.target.value)} style={IS}>
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
          <SecTitle text="Datos del Representante Legal" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Nombre completo del RL <span style={{color:"var(--accent)"}}>*</span></label>
              <input value={emp.rlNombre} onChange={e => ef("rlNombre")(e.target.value)} placeholder="Nombre y apellidos" style={IS} />
            </div>
            <div><label style={LS}>Tipo de documento <span style={{color:"var(--accent)"}}>*</span></label>
              <select value={emp.rlTipoDoc} onChange={e => ef("rlTipoDoc")(e.target.value)} style={IS}>
                <option value="">Selecciona...</option>
                <option>Cédula (CC)</option><option>Extranjería (CE)</option><option>Pasaporte</option>
              </select>
            </div>
            <div><label style={LS}>Número de documento <span style={{color:"var(--accent)"}}>*</span></label>
              <input value={emp.rlNumDoc} onChange={e => ef("rlNumDoc")(e.target.value)} placeholder="Ej. 1023456789" style={IS} />
            </div>
            <div><label style={LS}>Fecha de expedición <span style={{color:"var(--accent)"}}>*</span></label>
              <input type="date" value={emp.rlFechaDoc} onChange={e => ef("rlFechaDoc")(e.target.value)} style={IS} />
            </div>
            <div />
            <GeoPicker
              labelDep="Departamento expedición" labelCiu="Municipio expedición"
              depId={emp.rlDepExpId} ciuId={emp.rlMunExpId}
              onDep={v => setEmp(p => ({ ...p, rlDepExpId:v, rlMunExpId:"", rlMunExpDane:"", rlMunExpName:"" }))}
              onCiu={(id, dane, name) => setEmp(p => ({ ...p, rlMunExpId:id, rlMunExpDane:dane, rlMunExpName:name }))}
              regions={regions} getCitiesByRegion={getCitiesByRegion} geoLoading={geoLoading}
            />
            <div><label style={LS}>Fecha de nacimiento <span style={{color:"var(--accent)"}}>*</span></label>
              <input type="date" value={emp.rlFechaNac} onChange={e => ef("rlFechaNac")(e.target.value)} style={IS} />
            </div>
            <div />
            <GeoPicker
              labelDep="Departamento nacimiento" labelCiu="Municipio nacimiento"
              depId={emp.rlDepNacId} ciuId={emp.rlMunNacId}
              onDep={v => setEmp(p => ({ ...p, rlDepNacId:v, rlMunNacId:"", rlMunNacDane:"", rlMunNacName:"" }))}
              onCiu={(id, dane, name) => setEmp(p => ({ ...p, rlMunNacId:id, rlMunNacDane:dane, rlMunNacName:name }))}
              regions={regions} getCitiesByRegion={getCitiesByRegion} geoLoading={geoLoading}
            />
            <div><label style={LS}>Correo del RL</label>
              <input type="email" value={emp.rlEmail} onChange={e => ef("rlEmail")(e.target.value)} placeholder="rl@empresa.com" style={IS} />
            </div>
            <div><label style={LS}>Celular del RL</label>
              <input value={emp.rlCel} onChange={e => ef("rlCel")(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="300 000 0000" style={IS} />
            </div>
          </div>
        </>
      );

      case 3: return (
        <>
          <SecTitle text="Documentos requeridos" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <UploadZone label="Cámara de comercio"              hint="Vigente — no mayor a 30 días"            icon="ti-building"  state={empDocs.camCom}      onChange={ed("camCom")} />
            <UploadZone label="RUT"                             hint="Registro Único Tributario actualizado"   icon="ti-file-text" state={empDocs.rut}          onChange={ed("rut")} />
            <UploadZone label="Cédula del RL — Frente"          hint="JPG o PNG · Parte frontal"               icon="ti-id"        state={empDocs.cedFront}    onChange={ed("cedFront")} />
            <UploadZone label="Cédula del RL — Reverso"         hint="JPG o PNG · Parte trasera"               icon="ti-id"        state={empDocs.cedBack}     onChange={ed("cedBack")} />
            <UploadZone label="Declaración de origen de fondos" hint="Carta firmada por el RL"                icon="ti-writing"   state={empDocs.decOrigen}   onChange={ed("decOrigen")} />
            <UploadZone label="Estados financieros"             hint="Balance general y resultados último año" icon="ti-chart-bar" state={empDocs.estados}     onChange={ed("estados")} />
            <UploadZone label="Composición accionaria"          hint="Listado de socios con % de participación" icon="ti-users"   state={empDocs.composicion} onChange={ed("composicion")} span />
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"8px", padding:"12px 0", fontSize:"12px", color:"var(--t2)" }}>
            <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ marginTop:"2px", flexShrink:0 }} />
            <span>Declaro que la información suministrada y los documentos adjuntos son verídicos y autorizo a Ramplix para verificar los datos con fines de vinculación.</span>
          </div>
        </>
      );

      default: return null;
    }
  };

  // ── Pantallas ─────────────────────────────────────────────────

  if (stage === "checking") {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"300px", color:"var(--t3)", gap:"12px" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation:"spin 1s linear infinite" }}>
          <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
        </svg>
        Verificando estado...
      </div>
    );
  }

  if (stage === "tipo") {
    return (
      <div style={{ animation:"fadeUp .3s ease", maxWidth:"600px", margin:"0 auto" }}>
        {existingStatus && existingStatus !== "approved" && (
          <div style={{ padding:"12px 16px", background: existingStatus === "rejected" ? "var(--error-dim)" : "var(--warning-dim)", border:`1px solid ${existingStatus === "rejected" ? "var(--error)" : "var(--warning)"}`, borderRadius:"var(--radius-sm)", fontSize:"13px", color: existingStatus === "rejected" ? "var(--error)" : "var(--warning)", marginBottom:"20px" }}>
            {existingStatus === "rejected"
              ? "Tu solicitud fue rechazada. Puedes enviar una nueva corrigiendo la información."
              : "Tu solicitud está en revisión. El equipo de Ramplix se comunicará contigo pronto."}
          </div>
        )}
        <div style={{ textAlign:"center", marginBottom:"28px" }}>
          <h2 style={{ fontSize:"18px", fontWeight:700, marginBottom:"6px", color:"var(--t1)" }}>Bienvenido a Ramplix</h2>
          <p style={{ color:"var(--t2)", fontSize:"13.5px" }}>Selecciona cómo quieres registrarte</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" }}>
          {[
            { type:"pn"  as const, icon:"ti-user",     label:"Persona Natural", desc:"Soy una persona que desea acceder a los servicios de Ramplix en Colombia" },
            { type:"emp" as const, icon:"ti-building",  label:"Empresa",        desc:"Represento una empresa colombiana que quiere operar en Ramplix" },
          ].map(opt => (
            <button key={opt.type} onClick={() => handleStart(opt.type)}
              style={{ padding:"28px 22px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius)", cursor:"pointer", textAlign:"center", transition:".14s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor="var(--accent)"; (e.currentTarget as HTMLElement).style.background="var(--accent-dim)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor="var(--border)"; (e.currentTarget as HTMLElement).style.background="var(--surface)"; }}
            >
              <div style={{ width:"52px", height:"52px", borderRadius:"14px", background:"var(--accent-dim)", display:"grid", placeItems:"center", margin:"0 auto 14px", color:"var(--accent)" }}>
                <i className={`ti ${opt.icon}`} style={{ fontSize:"24px" }} />
              </div>
              <div style={{ fontWeight:700, fontSize:"15px", marginBottom:"8px", color:"var(--t1)" }}>{opt.label}</div>
              <div style={{ fontSize:"12.5px", color:"var(--t3)", lineHeight:1.6 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div style={{ animation:"fadeUp .3s ease", maxWidth:"480px", margin:"0 auto", textAlign:"center", padding:"36px 16px" }}>
        <div style={{ width:"60px", height:"60px", borderRadius:"50%", background:"var(--success-dim)", color:"var(--success)", display:"grid", placeItems:"center", margin:"0 auto 18px", fontSize:"28px" }}>
          <i className="ti ti-circle-check" />
        </div>
        <h2 style={{ fontSize:"20px", fontWeight:700, marginBottom:"8px", color:"var(--t1)" }}>Solicitud enviada</h2>
        <p style={{ color:"var(--t2)", fontSize:"13.5px", lineHeight:1.7, marginBottom:"22px", maxWidth:"360px", margin:"0 auto 22px" }}>
          Tu información fue recibida. El equipo de Ramplix revisará tu solicitud en <strong>1 a 3 días hábiles</strong>.
        </p>
        <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:"var(--radius)", padding:"16px", maxWidth:"300px", margin:"0 auto 22px" }}>
          {[
            ["Estado",    <span style={{ display:"inline-flex", alignItems:"center", gap:"5px", padding:"2px 8px", borderRadius:"20px", fontSize:"11px", fontWeight:600, color:"var(--warning)", background:"var(--warning-dim)" }}>⏳ En revisión</span>],
            ["Solicitud", <code style={{ fontFamily:"var(--mono)", fontSize:"12px", color:"var(--t1)" }}>{solId}</code>],
            ["Siguiente", "Revisión por el equipo Ramplix"],
          ].map(([k, v], i, arr) => (
            <div key={String(k)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom: i < arr.length-1 ? "1px solid var(--border)" : "none", fontSize:"12.5px" }}>
              <span style={{ color:"var(--t3)" }}>{k}</span>
              <span style={{ fontWeight:500 }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={() => { setStage("tipo"); setObType(""); setStep(0); setTermsAccepted(false); }}
          style={{ display:"inline-flex", alignItems:"center", gap:"7px", padding:"10px 18px", background:"var(--accent)", color:"#fff", border:"none", borderRadius:"var(--radius-sm)", fontWeight:600, fontSize:"13px", cursor:"pointer" }}>
          <i className="ti ti-refresh" />Nuevo registro
        </button>
      </div>
    );
  }

  // Pantalla formulario
  return (
    <div style={{ animation:"fadeUp .3s ease" }}>
      {/* Badge tipo */}
      <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"16px" }}>
        <span style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"4px 12px", borderRadius:"20px", fontSize:"12px", fontWeight:500, background:"var(--accent-dim)", color:"var(--accent)" }}>
          <i className={`ti ${obType === "pn" ? "ti-user" : "ti-building"}`} />
          {obType === "pn" ? "Persona Natural" : "Empresa"}
        </span>
        <button onClick={() => { setStage("tipo"); setObType(""); setStep(0); }}
          style={{ display:"inline-flex", alignItems:"center", gap:"5px", padding:"4px 10px", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", background:"var(--surface)", color:"var(--t2)", fontSize:"11px", cursor:"pointer" }}>
          <i className="ti ti-arrows-exchange" />Cambiar tipo
        </button>
      </div>

      {/* Stepper */}
      <div style={{ display:"flex", alignItems:"center", marginBottom:"22px" }}>
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"6px" }}>
              <div style={{ width:"30px", height:"30px", borderRadius:"50%", display:"grid", placeItems:"center", fontWeight:700, fontSize: i < step ? "14px" : "12px", flexShrink:0, background: i < step ? "var(--success)" : i === step ? "var(--accent)" : "var(--elevated)", color: i < step ? "#fff" : i === step ? "#fff" : "var(--t3)", border:`2px solid ${i < step ? "var(--success)" : i === step ? "var(--accent)" : "var(--border)"}` }}>
                {i < step ? <i className="ti ti-check" style={{ fontSize:"13px" }} /> : i + 1}
              </div>
              <div style={{ fontSize:"10.5px", fontWeight: i === step ? 600 : 400, color: i === step ? "var(--accent)" : i < step ? "var(--success)" : "var(--t3)", whiteSpace:"nowrap" }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ height:"2px", flex:1, background: i < step ? "var(--success)" : "var(--border)", margin:"0 4px", marginBottom:"22px" }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Formulario */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius)", padding:"22px 24px", boxShadow:"var(--shadow)", marginBottom:"16px" }}>
        {obType === "pn" ? renderPnStep() : renderEmpStep()}
      </div>

      {/* Navegación */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <button onClick={handleBack}
          style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"9px 16px", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", background:"var(--surface)", color:"var(--t2)", fontWeight:600, fontSize:"13px", cursor:"pointer" }}>
          <i className="ti ti-arrow-left" />Atrás
        </button>
        <span style={{ fontSize:"12px", color:"var(--t3)" }}>Paso {step + 1} de {steps.length}</span>
        <button onClick={handleNext} disabled={saving}
          style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"9px 18px", background:"var(--accent)", color:"#fff", border:"none", borderRadius:"var(--radius-sm)", fontWeight:600, fontSize:"13px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Enviando…" : step === steps.length - 1
            ? <><i className="ti ti-send" />Enviar solicitud</>
            : <>Siguiente<i className="ti ti-arrow-right" /></>
          }
        </button>
      </div>
    </div>
  );
};