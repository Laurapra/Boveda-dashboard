// src/pages/Onboarding.tsx
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  submitOnboardingPN, submitOnboardingEmp, getOnboardingStatus, saveUbos,
  getCountries, getDocumentTypes, getBanks, getCiiuCodes,
} from "../lib/bepayClient";
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

  // Va después de declarar loadGeo — antes daba "Cannot access variable
  // before it is declared" porque el useEffect estaba arriba de la función.
  // Envuelto en una promesa resuelta (en vez de llamar loadGeo directo) para
  // no disparar setState de forma síncrona dentro del efecto (regla
  // react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadGeo();
    });
    return () => { cancelled = true; };
  }, []);

  const getCitiesByRegion = (regionId: number) =>
    cities.filter(c => c.region_id === regionId)
          .slice().sort((a, b) => a.name.localeCompare(b.name, "es"));

  return { regions, cities, getCitiesByRegion, loading };
}

// ── Catálogos de Bepay (países, tipos de documento, bancos, CIIU) ──
// Se piden una sola vez al montar el formulario. El backend (bepay-charges)
// ya cachea cada catálogo 24h en la tabla geo_cache, así que estas llamadas
// son baratas incluso si el usuario recarga el formulario varias veces.
interface CatalogItem { value: string; label: string; }

// Las respuestas reales de Bepay no siempre usan los mismos nombres de
// campo entre catálogos — se extrae de forma defensiva en vez de asumir
// una sola forma, para no romper el formulario si un catálogo cambia.
function toCatalogItems(raw: unknown, kind: "country" | "docType" | "bank" | "ciiu"): CatalogItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item): CatalogItem | null => {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    if (kind === "country") {
      const label = String(r.name ?? r.nombre ?? "");
      return label ? { value: label, label } : null;
    }
    if (kind === "docType") {
      const value = String(r.short_name ?? r.code ?? r.id ?? "");
      const label = String(r.name ?? r.nombre ?? value);
      return value ? { value, label: `${label}${r.short_name ? ` (${r.short_name})` : ""}` } : null;
    }
    if (kind === "bank") {
      const label = String(r.name ?? r.nombre ?? r.bank_name ?? "");
      return label ? { value: label, label } : null;
    }
    // ciiu
    const code  = String(r.code ?? r.ciiu_code ?? r.codigo ?? r.id ?? "");
    const label = String(r.name ?? r.description ?? r.descripcion ?? r.nombre ?? code);
    return code ? { value: code, label: `${code} — ${label}` } : null;
  }).filter((x): x is CatalogItem => x !== null);
}

function useCatalogs() {
  const [countries, setCountries]         = useState<CatalogItem[]>([]);
  const [documentTypes, setDocumentTypes] = useState<CatalogItem[]>([]);
  const [banks, setBanks]                 = useState<CatalogItem[]>([]);
  const [ciiuCodes, setCiiuCodes]         = useState<CatalogItem[]>([]);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      const results = await Promise.allSettled([
        getCountries(), getDocumentTypes(), getBanks(200), getCiiuCodes(500),
      ]);
      if (cancelled) return;

      const [cRes, dRes, bRes, ciRes] = results;
      if (cRes.status === "fulfilled" && cRes.value?.success) setCountries(toCatalogItems(cRes.value.data, "country"));
      if (dRes.status === "fulfilled" && dRes.value?.success) setDocumentTypes(toCatalogItems(dRes.value.data, "docType"));
      if (bRes.status === "fulfilled" && bRes.value?.success) setBanks(toCatalogItems(bRes.value.data, "bank"));
      if (ciRes.status === "fulfilled" && ciRes.value?.success) setCiiuCodes(toCatalogItems(ciRes.value.data, "ciiu"));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { countries, documentTypes, banks, ciiuCodes, loading };
}

// ── Tipos ─────────────────────────────────────────────────────────
type ObType  = "" | "pn" | "emp";
type ObStage = "checking" | "tipo" | "form" | "success";

const PN_STEPS  = ["Identificación", "Contacto", "Actividad y tributaria", "Financiera", "Cumplimiento y banco", "Documentos"];
const EMP_STEPS = ["Empresa", "Tributaria", "Rep. Legal", "Financiera y banco", "Beneficiarios finales", "Documentos"];

// ── Listas de opciones (cuestionario KYC/KYB) ──────────────────────
const COUNTRIES = [
  "Colombia","Estados Unidos","México","España","Argentina","Chile","Perú",
  "Ecuador","Venezuela","Panamá","Brasil","Canadá","Otro",
];

const PN_INCOME_RANGES   = ["Menos de USD 1,000","USD 1,000 – 5,000","USD 5,001 – 10,000","USD 10,001 – 25,000","USD 25,001 – 50,000","USD 50,001 – 100,000","Más de USD 100,000"];
const PN_EXPENSE_RANGES  = ["Menos de USD 1,000","USD 1,001 – 5,000","USD 5,001 – 10,000","USD 10,001 – 25,000","USD 25,001 – 50,000","USD 50,001 – 100,000","Más de USD 100,000"];
const PN_NETWORTH_RANGES = ["Menos de USD 25,000","USD 25,001 – 50,000","USD 50,001 – 100,000","USD 100,001 – 500,000","USD 500,001 – 1,000,000","USD 1,000,001 – 5,000,000","Más de USD 5,000,000"];
const PN_FUNDS_ORIGIN = ["Salario","Honorarios","Actividad comercial","Inversiones","Dividendos","Venta de activos","Herencia","Ahorros","Rendimientos financieros","Activos virtuales (Criptomonedas)","Otro"];
const PN_INCOME_SOURCE = ["Empleado","Independiente","Empresario","Rentista de capital","Pensionado","Inversionista","Comercio internacional","Minería de criptoactivos","Otro"];
const PN_VOLUME_RANGES  = ["Menos de USD 5,000","USD 5,001 – 25,000","USD 25,001 – 50,000","USD 50,001 – 100,000","USD 100,001 – 500,000","USD 500,001 – 1,000,000","Más de USD 1,000,000"];
const PN_TXCOUNT_RANGES = ["1 – 10","11 – 50","51 – 100","101 – 500","501 – 1,000","Más de 1,000"];
const PN_AVGTX_RANGES   = ["Menos de USD 500","USD 501 – 2,500","USD 2,501 – 5,000","USD 5,001 – 10,000","USD 10,001 – 50,000","USD 50,001 – 100,000","Más de USD 100,000"];
const PN_MAXTX_RANGES   = ["Menos de USD 5,000","USD 5,001 – 25,000","USD 25,001 – 50,000","USD 50,001 – 100,000","USD 100,001 – 500,000","USD 500,001 – 1,000,000","Más de USD 1,000,000"];

const EMP_INCOME_RANGES  = ["Menos de USD 50,000","USD 50,001 – 100,000","USD 100,001 – 250,000","USD 250,001 – 500,000","USD 500,001 – 1,000,000","USD 1,000,001 – 5,000,000","Más de USD 5,000,000"];
const EMP_ASSETS_RANGES  = ["Menos de USD 50,000","USD 50,001 – 100,000","USD 100,001 – 500,000","USD 500,001 – 1,000,000","USD 1,000,001 – 5,000,000","USD 5,000,001 – 10,000,000","Más de USD 10,000,000"];
const EMP_LIAB_RANGES    = ["Menos de USD 25,000","USD 25,001 – 100,000","USD 100,001 – 500,000","USD 500,001 – 1,000,000","USD 1,000,001 – 5,000,000","USD 5,000,001 – 10,000,000","Más de USD 10,000,000"];
const EMP_NETWORTH_RANGES = ["Menos de USD 50,000","USD 50,001 – 100,000","USD 100,001 – 500,000","USD 500,001 – 1,000,000","USD 1,000,001 – 5,000,000","USD 5,000,001 – 10,000,000","Más de USD 10,000,000"];
const EMP_VOLUME_RANGES  = ["Menos de USD 10,000","USD 10,001 – 50,000","USD 50,001 – 100,000","USD 100,001 – 500,000","USD 500,001 – 1,000,000","USD 1,000,001 – 5,000,000","Más de USD 5,000,000"];
const EMP_TXCOUNT_RANGES = ["1 – 50","51 – 100","101 – 500","501 – 1,000","1,001 – 5,000","Más de 5,000"];
const EMP_AVGTX_RANGES   = ["Menos de USD 500","USD 500 – 2,500","USD 2,501 – 10,000","USD 10,001 – 50,000","USD 50,001 – 100,000","USD 100,001 – 500,000","Más de USD 500,000"];
const EMP_MAXTX_RANGES   = ["Menos de USD 10,000","USD 10,001 – 50,000","USD 50,001 – 100,000","USD 100,001 – 500,000","USD 500,001 – 1,000,000","USD 1,000,001 – 5,000,000","Más de USD 5,000,000"];

const SEX_OPTIONS = ["Masculino", "Femenino", "Otro"];
const YES_NO = ["Sí", "No"];

// Listas usadas mientras cargan los catálogos reales de Bepay, o si la
// llamada falla — así el formulario nunca queda bloqueado sin opciones.
const toItems = (arr: string[]) => arr.map(s => ({ value: s, label: s }));
const COUNTRY_FALLBACK = toItems(COUNTRIES);
const DOC_TYPE_FALLBACK = [
  { value: "CC",  label: "Cédula de ciudadanía (CC)" },
  { value: "CE",  label: "Cédula de extranjería (CE)" },
  { value: "PAS", label: "Pasaporte (PAS)" },
  { value: "TI",  label: "Tarjeta de identidad (TI)" },
  { value: "NIT", label: "NIT" },
];

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

// ── Select genérico de opciones (rangos, listas fijas, etc.) ──────
function OptSelect({ label, value, onChange, options, required, full, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
  required?: boolean; full?: boolean; placeholder?: string;
}) {
  return (
    <div style={{ gridColumn: full ? "1/-1" : undefined }}>
      <label style={LS}>{label} {required && <span style={{color:"var(--accent)"}}>*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={IS}>
        <option value="">{placeholder ?? "Selecciona..."}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── Select respaldado por un catálogo real de Bepay (países, tipos de
// documento...), con lista de respaldo mientras carga o si falla ────
function CatalogSelect({ label, value, onChange, items, fallback, loading, required, full }: {
  label: string; value: string; onChange: (v: string) => void;
  items: CatalogItem[]; fallback: CatalogItem[]; loading: boolean;
  required?: boolean; full?: boolean;
}) {
  const opts = items.length > 0 ? items : fallback;
  const stillLoading = loading && items.length === 0;
  return (
    <div style={{ gridColumn: full ? "1/-1" : undefined }}>
      <label style={LS}>{label} {required && <span style={{color:"var(--accent)"}}>*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={IS} disabled={stillLoading}>
        <option value="">{stillLoading ? "Cargando…" : "Selecciona..."}</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Input con sugerencias de un catálogo (bancos, CIIU) — permite
// escribir libremente si el catálogo no trae la opción exacta ──────
function CatalogInput({ label, value, onChange, items, loading, placeholder, required, full, listId }: {
  label: string; value: string; onChange: (v: string) => void;
  items: CatalogItem[]; loading: boolean; placeholder?: string;
  required?: boolean; full?: boolean; listId: string;
}) {
  return (
    <div style={{ gridColumn: full ? "1/-1" : undefined }}>
      <label style={LS}>{label} {required && <span style={{color:"var(--accent)"}}>*</span>}</label>
      <input
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={loading && items.length === 0 ? "Cargando…" : (placeholder ?? "Escribe o selecciona...")}
        style={IS}
      />
      <datalist id={listId}>
        {items.map(o => <option key={o.value} value={o.label} />)}
      </datalist>
    </div>
  );
}

// ── Bloque de declaraciones (checkboxes finales de cumplimiento) ──
interface DeclDef { key: string; label: string; }
function DeclChecklist({ defs, values, onToggle }: {
  defs: DeclDef[]; values: Record<string, boolean>; onToggle: (k: string, v: boolean) => void;
}) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px", padding:"12px 0" }}>
      {defs.map(d => (
        <label key={d.key} style={{ display:"flex", alignItems:"flex-start", gap:"8px", fontSize:"12px", color:"var(--t2)", cursor:"pointer" }}>
          <input type="checkbox" checked={!!values[d.key]} onChange={e => onToggle(d.key, e.target.checked)} style={{ marginTop:"2px", flexShrink:0 }} />
          <span>{d.label}</span>
        </label>
      ))}
    </div>
  );
}

const PN_DECL_DEFS: DeclDef[] = [
  { key: "decl_truthful_info",     label: "Declaro que la información suministrada es veraz." },
  { key: "decl_lawful_funds",      label: "Declaro que el origen de mis fondos es lícito." },
  { key: "decl_data_processing",   label: "Autorizo el tratamiento de mis datos personales." },
  { key: "decl_privacy_policy",    label: "Acepto la Política de Privacidad." },
  { key: "decl_screening_consent", label: "Autorizo consultas en listas restrictivas y validaciones de cumplimiento." },
];

const EMP_DECL_DEFS: DeclDef[] = [
  { key: "decl_truthful_info",      label: "Declaramos que la información suministrada es veraz." },
  { key: "decl_lawful_funds",       label: "Declaramos que el origen de los fondos es lícito." },
  { key: "decl_data_processing",    label: "Autorizamos el tratamiento de datos personales." },
  { key: "decl_privacy_policy",     label: "Aceptamos la Política de Privacidad." },
  { key: "decl_screening_consent",  label: "Autorizamos consultas en listas restrictivas y procesos de debida diligencia." },
  { key: "decl_sarlaft_compliance", label: "Declaramos cumplir con las normas SARLAFT/SAGRILAFT (si aplica)." },
];

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
      } catch (err: unknown) {
        alert(`Error al subir: ${err instanceof Error ? err.message : String(err)}`);
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
  const catalogs = useCatalogs();

  // ── Estado PN ─────────────────────────────────────────────────
  const [pn, setPn] = useState({
    docType:"", docNum:"", docFecha:"",
    expDepId:"", expMunId:"", expMunDane:"", expMunName:"",
    pn1:"", pn2:"", pa1:"", pa2:"",
    fechaNac:"",
    nacionalidad:"Colombia", paisNac:"Colombia",
    nacDepId:"", nacMunId:"", nacMunDane:"", nacMunName:"",
    sexo:"",
    email:"", cel:"", cel2:"", telFijo:"",
    paisRes:"Colombia",
    depResId:"", ciuResId:"", ciuResDane:"", ciuResName:"",
    direccion:"", codigoPostal:"",
    ocupacion:"", profesion:"", actividadEconomica:"", empresa:"", cargo:"", tipoEmpleo:"",
    ingreso:"",
    paisResidenciaFiscal:"Colombia", tieneResidenciaFiscalOtroPais:"", tinFiscal:"", rutNumero:"",
    regimenTributario:"", esResponsableIva:"",
    egresosMensuales:"", patrimonio:"",
    origenFondos:"", origenFondosOtro:"",
    fuenteIngresos:"", fuenteIngresosOtro:"",
    volumenMensual:"", numTransaccionesMensuales:"", valorPromedioTx:"", valorMaximoTx:"",
    esPep:"", pepDetalle:"", esPepRelacionado:"",
    bancoNombre:"", bancoTipoCuenta:"", bancoNumeroCuenta:"", bancoTitular:"",
    bancoTitularTipoDoc:"", bancoTitularNumDoc:"", bancoPais:"Colombia", bancoMoneda:"COP",
  });

  const [pnDecls, setPnDecls] = useState<Record<string, boolean>>({
    decl_truthful_info:false, decl_lawful_funds:false, decl_data_processing:false,
    decl_privacy_policy:false, decl_screening_consent:false,
  });

  const [pnDocs, setPnDocs] = useState<Record<string, UploadState>>({
    cedFront:  { file:null, url:null, uploading:false, done:false },
    cedBack:   { file:null, url:null, uploading:false, done:false },
    selfie:    { file:null, url:null, uploading:false, done:false },
    decOrigen: { file:null, url:null, uploading:false, done:false },
  });

  // ── Estado Empresa ────────────────────────────────────────────
  const [emp, setEmp] = useState({
    razon:"", nombreComercial:"", nit:"", tipoSoc:"", fechaConst:"",
    actEco:"", descripcionNegocio:"", paisConstitucion:"Colombia",
    depEmpId:"", ciuEmpId:"", ciuEmpDane:"", ciuEmpName:"",
    direccion:"", codigoPostal:"", web:"", email:"", tel:"",
    regimenTributario:"", esResponsableIva:"", esGranContribuyente:"", esAutorretenedor:"",
    paisResidenciaFiscal:"Colombia", paisesDeclaraImpuestos:"",
    rlPn1:"", rlPn2:"", rlPa1:"", rlPa2:"",
    rlTipoDoc:"", rlNumDoc:"", rlFechaDoc:"",
    rlDepExpId:"", rlMunExpId:"", rlMunExpDane:"", rlMunExpName:"",
    rlFechaNac:"", rlNacionalidad:"Colombia", rlPaisNac:"Colombia",
    rlDepNacId:"", rlMunNacId:"", rlMunNacDane:"", rlMunNacName:"",
    rlSexo:"", rlEmail:"", rlCel:"", rlDireccion:"", rlCargo:"", rlProfesion:"",
    origenFondos:"",
    ingresosAnuales:"", activos:"", pasivos:"", patrimonio:"",
    volumenMensual:"", numTransacciones:"", valorPromedioTx:"", valorMaximoTx:"",
    bancoNombre:"", bancoTipoCuenta:"", bancoNumeroCuenta:"", bancoTitular:"", bancoPais:"Colombia",
  });

  const [empDecls, setEmpDecls] = useState<Record<string, boolean>>({
    decl_truthful_info:false, decl_lawful_funds:false, decl_data_processing:false,
    decl_privacy_policy:false, decl_screening_consent:false, decl_sarlaft_compliance:false,
  });

  interface UboRow { full_name:string; doc_type:string; doc_number:string; nationality:string; residence_country:string; ownership_pct:string; is_pep:string; funds_origin:string; }
  const emptyUbo: UboRow = { full_name:"", doc_type:"", doc_number:"", nationality:"Colombia", residence_country:"Colombia", ownership_pct:"", is_pep:"", funds_origin:"" };
  const [ubos, setUbos] = useState<UboRow[]>([{ ...emptyUbo }]);
  const addUbo = () => setUbos(u => [...u, { ...emptyUbo }]);
  const removeUbo = (i: number) => setUbos(u => u.filter((_, idx) => idx !== i));
  const updateUbo = (i: number, k: keyof UboRow, v: string) => setUbos(u => u.map((row, idx) => idx === i ? { ...row, [k]: v } : row));

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

  const fullName   = [pn.pn1, pn.pn2, pn.pa1, pn.pa2].filter(Boolean).join(" ");
  const rlFullName = [emp.rlPn1, emp.rlPn2, emp.rlPa1, emp.rlPa2].filter(Boolean).join(" ");
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
  // No llamar checkStatus() directo en el cuerpo del efecto — dispara
  // setState de forma síncrona dentro del efecto (regla
  // react-hooks/set-state-in-effect). Se envuelve en una promesa resuelta
  // con guard de "cancelled", mismo patrón que el resto del proyecto.
  let cancelled = false;
  Promise.resolve().then(async () => {
    if (cancelled) return;
    await checkStatus();
  });

  const chPn = supabase.channel("ob-pn-status")
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"onboarding_pn" }, () => checkStatus())
    .subscribe();

  const chEmp = supabase.channel("ob-emp-status")
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"onboarding_emp" }, () => checkStatus())
    .subscribe();

  return () => {
    cancelled = true;
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
          doc_type:        pn.docType || "CC",
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
          address:         pn.direccion || `Ciudad DANE ${pn.ciuResDane}`,
          occupation:      pn.ocupacion,
          company:         pn.empresa,
          job_title:       pn.cargo,
          income_range:    pn.ingreso,
          funds_origin:    pn.origenFondos,
          gender:          pn.sexo || "Masculino",
          doc_front_url:   pnDocs.cedFront.url,
          doc_back_url:    pnDocs.cedBack.url,
          selfie_url:      pnDocs.selfie.url,
          funds_decl_url:  pnDocs.decOrigen.url,
          terms_accepted:  true,

          // ── Campos KYC ampliados ─────────────────────────────
          nationality:        pn.nacionalidad || undefined,
          birth_country:      pn.paisNac || undefined,
          sex:                pn.sexo || undefined,
          residence_country:  pn.paisRes || undefined,
          landline_phone:     pn.telFijo || undefined,
          postal_code:        pn.codigoPostal || undefined,
          profession:         pn.profesion || undefined,
          economic_activity:  pn.actividadEconomica || undefined,
          employment_type:    pn.tipoEmpleo || undefined,
          tax_residence_country:     pn.paisResidenciaFiscal || undefined,
          has_foreign_tax_residence: pn.tieneResidenciaFiscalOtroPais || undefined,
          tax_id_tin:                pn.tinFiscal || undefined,
          rut_number:                pn.rutNumero || undefined,
          tax_regime:                pn.regimenTributario || undefined,
          is_vat_responsible:        pn.esResponsableIva || undefined,
          monthly_expenses_range: pn.egresosMensuales || undefined,
          net_worth_range:        pn.patrimonio || undefined,
          funds_origin_other:     pn.origenFondosOtro || undefined,
          income_source:          pn.fuenteIngresos || undefined,
          income_source_other:    pn.fuenteIngresosOtro || undefined,
          monthly_volume_range:   pn.volumenMensual || undefined,
          monthly_tx_count_range: pn.numTransaccionesMensuales || undefined,
          avg_tx_value_range:     pn.valorPromedioTx || undefined,
          max_tx_value_range:     pn.valorMaximoTx || undefined,
          is_pep:          pn.esPep || undefined,
          pep_details:     pn.pepDetalle || undefined,
          is_pep_related:  pn.esPepRelacionado || undefined,
          bank_name:              pn.bancoNombre || undefined,
          bank_account_type:      pn.bancoTipoCuenta || undefined,
          bank_account_number:    pn.bancoNumeroCuenta || undefined,
          bank_account_holder:    pn.bancoTitular || undefined,
          bank_holder_doc_type:   pn.bancoTitularTipoDoc || undefined,
          bank_holder_doc_number: pn.bancoTitularNumDoc || undefined,
          bank_country:           pn.bancoPais || undefined,
          bank_currency:          pn.bancoMoneda || undefined,
          decl_truthful_info:     pnDecls.decl_truthful_info,
          decl_lawful_funds:      pnDecls.decl_lawful_funds,
          decl_data_processing:   pnDecls.decl_data_processing,
          decl_privacy_policy:    pnDecls.decl_privacy_policy,
          decl_screening_consent: pnDecls.decl_screening_consent,
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
          rl_full_name:        rlFullName,
          rl_doc_type:         emp.rlTipoDoc || "CC",
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

          // ── Campos KYB ampliados ─────────────────────────────
          commercial_name:       emp.nombreComercial || undefined,
          business_description:  emp.descripcionNegocio || undefined,
          incorporation_country: emp.paisConstitucion || undefined,
          address:                emp.direccion || undefined,
          postal_code:            emp.codigoPostal || undefined,
          tax_regime:            emp.regimenTributario || undefined,
          is_vat_responsible:    emp.esResponsableIva || undefined,
          is_gran_contribuyente: emp.esGranContribuyente || undefined,
          is_autorretenedor:     emp.esAutorretenedor || undefined,
          tax_residence_country: emp.paisResidenciaFiscal || undefined,
          tax_countries:         emp.paisesDeclaraImpuestos || undefined,
          rl_first_name:     emp.rlPn1 || undefined,
          rl_middle_name:    emp.rlPn2 || undefined,
          rl_first_surname:  emp.rlPa1 || undefined,
          rl_middle_surname: emp.rlPa2 || undefined,
          rl_nationality:    emp.rlNacionalidad || undefined,
          rl_birth_country:  emp.rlPaisNac || undefined,
          rl_sex:            emp.rlSexo || undefined,
          rl_address:        emp.rlDireccion || undefined,
          rl_position:       emp.rlCargo || undefined,
          rl_profession:     emp.rlProfesion || undefined,
          annual_income_range:    emp.ingresosAnuales || undefined,
          assets_range:           emp.activos || undefined,
          liabilities_range:      emp.pasivos || undefined,
          net_worth_range:        emp.patrimonio || undefined,
          monthly_volume_range:   emp.volumenMensual || undefined,
          monthly_tx_count_range: emp.numTransacciones || undefined,
          avg_tx_value_range:     emp.valorPromedioTx || undefined,
          max_tx_value_range:     emp.valorMaximoTx || undefined,
          bank_name:           emp.bancoNombre || undefined,
          bank_account_type:   emp.bancoTipoCuenta || undefined,
          bank_account_number: emp.bancoNumeroCuenta || undefined,
          bank_account_holder: emp.bancoTitular || undefined,
          bank_country:        emp.bancoPais || undefined,
          decl_truthful_info:      empDecls.decl_truthful_info,
          decl_lawful_funds:       empDecls.decl_lawful_funds,
          decl_data_processing:    empDecls.decl_data_processing,
          decl_privacy_policy:     empDecls.decl_privacy_policy,
          decl_screening_consent:  empDecls.decl_screening_consent,
          decl_sarlaft_compliance: empDecls.decl_sarlaft_compliance,
        });
      }

      if (res?.success === false) {
        onToast("error", "Error al enviar", res.error ?? "Inténtalo de nuevo");
        return;
      }

      // ── Guardar beneficiarios finales (UBO) — solo para empresas ─
      if (obType === "emp" && res?.id) {
        const validUbos = ubos.filter(u => u.full_name.trim());
        if (validUbos.length > 0) {
          const uboRes = await saveUbos(res.id, validUbos);
          if (uboRes?.success === false) {
            onToast("error", "Beneficiarios finales", uboRes.error ?? "No se pudieron guardar los beneficiarios finales");
          }
        }
      }

      const id = `OB-${new Date().getFullYear()}-${String(Math.floor(Math.random()*99999)).padStart(5,"0")}`;
      setSolId(res?.id?.slice(0,8).toUpperCase() ?? id);
      setExistingStatus("pending");
      onToast("ok", "Solicitud enviada", "El equipo de Ramplix revisará tu información");
      setStage("success");
    } catch (err: unknown) {
      onToast("error", "Error", err instanceof Error ? err.message : String(err));
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
            <CatalogSelect label="Tipo de documento" value={pn.docType} onChange={pf("docType")}
              items={catalogs.documentTypes} fallback={DOC_TYPE_FALLBACK} loading={catalogs.loading} required />
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
                <label style={LS}>Nombre completo (generado automáticamente — se usa como Nombre Comercial)</label>
                <input value={fullName} readOnly style={{ ...IS, background:"var(--elevated)", color:"var(--t2)" }} />
              </div>
            )}
          </div>

          <SecTitle text="Datos personales" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div><label style={LS}>Fecha de nacimiento <span style={{color:"var(--accent)"}}>*</span> <RampTag /></label>
              <input type="date" value={pn.fechaNac} onChange={e => pf("fechaNac")(e.target.value)} style={IS} />
            </div>
            <OptSelect label="Sexo" value={pn.sexo} onChange={pf("sexo")} options={SEX_OPTIONS} />
            <CatalogSelect label="Nacionalidad" value={pn.nacionalidad} onChange={pf("nacionalidad")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
            <CatalogSelect label="País de nacimiento" value={pn.paisNac} onChange={pf("paisNac")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
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
            <div><label style={LS}>Teléfono fijo</label>
              <input value={pn.telFijo} onChange={e => pf("telFijo")(e.target.value)} placeholder="Opcional" style={IS} />
            </div>
          </div>
          <SecTitle text="Lugar de residencia" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <CatalogSelect label="País de residencia" value={pn.paisRes} onChange={pf("paisRes")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} required />
            <div />
            <GeoPicker
              labelDep="Departamento *" labelCiu="Ciudad *"
              depId={pn.depResId} ciuId={pn.ciuResId}
              onDep={v => setPn(p => ({ ...p, depResId:v, ciuResId:"", ciuResDane:"", ciuResName:"" }))}
              onCiu={(id, dane, name) => setPn(p => ({ ...p, ciuResId:id, ciuResDane:dane, ciuResName:name }))}
              hint regions={regions} getCitiesByRegion={getCitiesByRegion} geoLoading={geoLoading}
            />
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Dirección</label>
              <input value={pn.direccion} onChange={e => pf("direccion")(e.target.value)} placeholder="Calle, número, barrio" style={IS} />
            </div>
            <div><label style={LS}>Código postal</label>
              <input value={pn.codigoPostal} onChange={e => pf("codigoPostal")(e.target.value)} placeholder="Opcional" style={IS} />
            </div>
          </div>
        </>
      );

      case 2: return (
        <>
          <SecTitle text="Información laboral" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div><label style={LS}>Ocupación <span style={{color:"var(--accent)"}}>*</span></label>
              <select value={pn.ocupacion} onChange={e => pf("ocupacion")(e.target.value)} style={IS}>
                <option value="">Selecciona...</option>
                <option>Empleado</option><option>Independiente / Emprendedor</option>
                <option>Comerciante</option><option>Pensionado</option>
                <option>Estudiante</option><option>Ama de casa</option><option>Otro</option>
              </select>
            </div>
            <div><label style={LS}>Profesión</label>
              <input value={pn.profesion} onChange={e => pf("profesion")(e.target.value)} placeholder="Ej. Contador, Ingeniero..." style={IS} />
            </div>
            <div><label style={LS}>Actividad económica</label>
              <input value={pn.actividadEconomica} onChange={e => pf("actividadEconomica")(e.target.value)} placeholder="Ej. Comercio, servicios..." style={IS} />
            </div>
            <div><label style={LS}>Empresa / negocio (si aplica)</label>
              <input value={pn.empresa} onChange={e => pf("empresa")(e.target.value)} placeholder="Nombre de tu empresa" style={IS} />
            </div>
            <div><label style={LS}>Cargo</label>
              <input value={pn.cargo} onChange={e => pf("cargo")(e.target.value)} placeholder="Ej. Gerente, Asesor..." style={IS} />
            </div>
            <OptSelect label="¿Trabaja de manera independiente o dependiente?" value={pn.tipoEmpleo} onChange={pf("tipoEmpleo")} options={["Independiente","Dependiente"]} />
          </div>

          <SecTitle text="Información tributaria" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <CatalogSelect label="País de residencia fiscal" value={pn.paisResidenciaFiscal} onChange={pf("paisResidenciaFiscal")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
            <OptSelect label="¿Tiene residencia fiscal en otro país?" value={pn.tieneResidenciaFiscalOtroPais} onChange={pf("tieneResidenciaFiscalOtroPais")} options={YES_NO} />
            <div><label style={LS}>Número de Identificación Tributaria (TIN)</label>
              <input value={pn.tinFiscal} onChange={e => pf("tinFiscal")(e.target.value)} placeholder="Si aplica" style={IS} />
            </div>
            <div><label style={LS}>RUT</label>
              <input value={pn.rutNumero} onChange={e => pf("rutNumero")(e.target.value)} placeholder="Si aplica" style={IS} />
            </div>
            <div><label style={LS}>Régimen tributario</label>
              <input value={pn.regimenTributario} onChange={e => pf("regimenTributario")(e.target.value)} placeholder="Ej. Régimen simple, ordinario..." style={IS} />
            </div>
            <OptSelect label="¿Es responsable de IVA?" value={pn.esResponsableIva} onChange={pf("esResponsableIva")} options={YES_NO} />
          </div>
        </>
      );

      case 3: return (
        <>
          <SecTitle text="Ingresos y egresos" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <OptSelect label="Ingresos mensuales" value={pn.ingreso} onChange={pf("ingreso")} options={PN_INCOME_RANGES} />
            <OptSelect label="Egresos mensuales" value={pn.egresosMensuales} onChange={pf("egresosMensuales")} options={PN_EXPENSE_RANGES} />
            <OptSelect label="Patrimonio" value={pn.patrimonio} onChange={pf("patrimonio")} options={PN_NETWORTH_RANGES} />
          </div>

          <SecTitle text="Origen y fuente de fondos" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <OptSelect label="Origen de los fondos" value={pn.origenFondos} onChange={pf("origenFondos")} options={PN_FUNDS_ORIGIN} required />
            {pn.origenFondos === "Otro" && (
              <div><label style={LS}>Especifique origen de fondos</label>
                <input value={pn.origenFondosOtro} onChange={e => pf("origenFondosOtro")(e.target.value)} style={IS} />
              </div>
            )}
            <OptSelect label="Fuente principal de ingresos" value={pn.fuenteIngresos} onChange={pf("fuenteIngresos")} options={PN_INCOME_SOURCE} />
            {pn.fuenteIngresos === "Otro" && (
              <div><label style={LS}>Especifique fuente de ingresos</label>
                <input value={pn.fuenteIngresosOtro} onChange={e => pf("fuenteIngresosOtro")(e.target.value)} style={IS} />
              </div>
            )}
          </div>

          <SecTitle text="Perfil transaccional esperado" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <OptSelect label="Volumen mensual estimado" value={pn.volumenMensual} onChange={pf("volumenMensual")} options={PN_VOLUME_RANGES} />
            <OptSelect label="Número estimado de transacciones mensuales" value={pn.numTransaccionesMensuales} onChange={pf("numTransaccionesMensuales")} options={PN_TXCOUNT_RANGES} />
            <OptSelect label="Valor promedio por transacción" value={pn.valorPromedioTx} onChange={pf("valorPromedioTx")} options={PN_AVGTX_RANGES} />
            <OptSelect label="Valor máximo esperado por transacción" value={pn.valorMaximoTx} onChange={pf("valorMaximoTx")} options={PN_MAXTX_RANGES} />
          </div>
        </>
      );

      case 4: return (
        <>
          <SecTitle text="Información de cumplimiento" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <OptSelect label="¿Es usted una Persona Expuesta Políticamente (PEP)?" value={pn.esPep} onChange={pf("esPep")} options={YES_NO} />
            {pn.esPep === "Sí" && (
              <div style={{ gridColumn:"1/-1" }}><label style={LS}>Indique el cargo, la entidad y el período en el que ejerció funciones</label>
                <input value={pn.pepDetalle} onChange={e => pf("pepDetalle")(e.target.value)} style={IS} />
              </div>
            )}
            <OptSelect label="¿Es familiar o asociado cercano de un PEP?" value={pn.esPepRelacionado} onChange={pf("esPepRelacionado")} options={YES_NO} />
          </div>

          <SecTitle text="Información bancaria" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <CatalogInput label="Banco" value={pn.bancoNombre} onChange={pf("bancoNombre")} items={catalogs.banks} loading={catalogs.loading} listId="banks-pn" />
            <div><label style={LS}>Tipo de cuenta</label>
              <select value={pn.bancoTipoCuenta} onChange={e => pf("bancoTipoCuenta")(e.target.value)} style={IS}>
                <option value="">Selecciona...</option>
                <option>Ahorros</option><option>Corriente</option>
              </select>
            </div>
            <div><label style={LS}>Número de cuenta</label>
              <input value={pn.bancoNumeroCuenta} onChange={e => pf("bancoNumeroCuenta")(e.target.value)} style={IS} />
            </div>
            <div><label style={LS}>Titular de la cuenta</label>
              <input value={pn.bancoTitular} onChange={e => pf("bancoTitular")(e.target.value)} style={IS} />
            </div>
            <CatalogSelect label="Tipo de documento del titular" value={pn.bancoTitularTipoDoc} onChange={pf("bancoTitularTipoDoc")}
              items={catalogs.documentTypes} fallback={DOC_TYPE_FALLBACK} loading={catalogs.loading} />
            <div><label style={LS}>Número de documento del titular</label>
              <input value={pn.bancoTitularNumDoc} onChange={e => pf("bancoTitularNumDoc")(e.target.value)} style={IS} />
            </div>
            <CatalogSelect label="País de la cuenta" value={pn.bancoPais} onChange={pf("bancoPais")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
            <div><label style={LS}>Moneda</label>
              <select value={pn.bancoMoneda} onChange={e => pf("bancoMoneda")(e.target.value)} style={IS}>
                <option>COP</option><option>USD</option><option>EUR</option>
              </select>
            </div>
          </div>
        </>
      );

      case 5: return (
        <>
          <SecTitle text="Documentos requeridos" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <UploadZone label="Cédula — Frente"                hint="JPG o PNG · Parte frontal"    icon="ti-id"      state={pnDocs.cedFront}  onChange={pd("cedFront")} />
            <UploadZone label="Cédula — Reverso"               hint="JPG o PNG · Parte trasera"    icon="ti-id"      state={pnDocs.cedBack}   onChange={pd("cedBack")} />
            <UploadZone label="Selfie con documento"           hint="Foto sosteniendo tu cédula"  icon="ti-camera"  state={pnDocs.selfie}    onChange={pd("selfie")} />
            <UploadZone label="Declaración de origen de fondos" hint="PDF firmado"                 icon="ti-writing" state={pnDocs.decOrigen} onChange={pd("decOrigen")} />
          </div>
          <SecTitle text="Declaraciones" />
          <DeclChecklist defs={PN_DECL_DEFS} values={pnDecls} onToggle={(k, v) => setPnDecls(p => ({ ...p, [k]: v }))} />
          <div style={{ display:"flex", alignItems:"flex-start", gap:"8px", padding:"12px 0", fontSize:"12px", color:"var(--t2)" }}>
            <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ marginTop:"2px", flexShrink:0 }} />
            <span>Acepto los Términos y Condiciones, y autorizo a Ramplix para verificar los datos suministrados con fines de vinculación.</span>
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
            <div><label style={LS}>Nombre comercial</label>
              <input value={emp.nombreComercial} onChange={e => ef("nombreComercial")(e.target.value)} placeholder="Opcional" style={IS} />
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
            <CatalogInput label="Actividad económica (CIIU)" value={emp.actEco} onChange={ef("actEco")}
              items={catalogs.ciiuCodes} loading={catalogs.loading} listId="ciiu-codes"
              placeholder="Busca por código o nombre de actividad" required full />
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Descripción del negocio</label>
              <input value={emp.descripcionNegocio} onChange={e => ef("descripcionNegocio")(e.target.value)} placeholder="Breve descripción de la actividad" style={IS} />
            </div>
            <CatalogSelect label="País de constitución" value={emp.paisConstitucion} onChange={ef("paisConstitucion")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
            <div />
            <GeoPicker
              labelDep="Departamento *" labelCiu="Ciudad *"
              depId={emp.depEmpId} ciuId={emp.ciuEmpId}
              onDep={v => setEmp(p => ({ ...p, depEmpId:v, ciuEmpId:"", ciuEmpDane:"", ciuEmpName:"" }))}
              onCiu={(id, dane, name) => setEmp(p => ({ ...p, ciuEmpId:id, ciuEmpDane:dane, ciuEmpName:name }))}
              hint regions={regions} getCitiesByRegion={getCitiesByRegion} geoLoading={geoLoading}
            />
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Dirección</label>
              <input value={emp.direccion} onChange={e => ef("direccion")(e.target.value)} placeholder="Calle, número, barrio" style={IS} />
            </div>
            <div><label style={LS}>Código postal</label>
              <input value={emp.codigoPostal} onChange={e => ef("codigoPostal")(e.target.value)} placeholder="Opcional" style={IS} />
            </div>
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
          <SecTitle text="Información tributaria" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div><label style={LS}>Régimen tributario</label>
              <input value={emp.regimenTributario} onChange={e => ef("regimenTributario")(e.target.value)} placeholder="Ej. Régimen ordinario, simple..." style={IS} />
            </div>
            <OptSelect label="¿Es responsable de IVA?" value={emp.esResponsableIva} onChange={ef("esResponsableIva")} options={YES_NO} />
            <OptSelect label="¿Es gran contribuyente?" value={emp.esGranContribuyente} onChange={ef("esGranContribuyente")} options={YES_NO} />
            <OptSelect label="¿Es autorretenedor?" value={emp.esAutorretenedor} onChange={ef("esAutorretenedor")} options={YES_NO} />
            <CatalogSelect label="País de residencia fiscal" value={emp.paisResidenciaFiscal} onChange={ef("paisResidenciaFiscal")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
            <div><label style={LS}>Países donde declara impuestos</label>
              <input value={emp.paisesDeclaraImpuestos} onChange={e => ef("paisesDeclaraImpuestos")(e.target.value)} placeholder="Ej. Colombia, Estados Unidos" style={IS} />
            </div>
          </div>

          <SecTitle text="Origen de fondos de la empresa" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={LS}>Origen de fondos <span style={{color:"var(--accent)"}}>*</span></label>
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
            <div><label style={LS}>Primer nombre <span style={{color:"var(--accent)"}}>*</span></label>
              <input value={emp.rlPn1} onChange={e => ef("rlPn1")(e.target.value)} style={IS} />
            </div>
            <div><label style={LS}>Segundo nombre</label>
              <input value={emp.rlPn2} onChange={e => ef("rlPn2")(e.target.value)} placeholder="Opcional" style={IS} />
            </div>
            <div><label style={LS}>Primer apellido <span style={{color:"var(--accent)"}}>*</span></label>
              <input value={emp.rlPa1} onChange={e => ef("rlPa1")(e.target.value)} style={IS} />
            </div>
            <div><label style={LS}>Segundo apellido</label>
              <input value={emp.rlPa2} onChange={e => ef("rlPa2")(e.target.value)} placeholder="Opcional" style={IS} />
            </div>
            {rlFullName && (
              <div style={{ gridColumn:"1/-1" }}>
                <label style={LS}>Nombre completo (generado automáticamente)</label>
                <input value={rlFullName} readOnly style={{ ...IS, background:"var(--elevated)", color:"var(--t2)" }} />
              </div>
            )}
            <CatalogSelect label="Tipo de documento" value={emp.rlTipoDoc} onChange={ef("rlTipoDoc")}
              items={catalogs.documentTypes} fallback={DOC_TYPE_FALLBACK} loading={catalogs.loading} required />
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
            <OptSelect label="Sexo" value={emp.rlSexo} onChange={ef("rlSexo")} options={SEX_OPTIONS} />
            <CatalogSelect label="Nacionalidad" value={emp.rlNacionalidad} onChange={ef("rlNacionalidad")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
            <CatalogSelect label="País de nacimiento" value={emp.rlPaisNac} onChange={ef("rlPaisNac")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
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
            <div style={{ gridColumn:"1/-1" }}><label style={LS}>Dirección del RL</label>
              <input value={emp.rlDireccion} onChange={e => ef("rlDireccion")(e.target.value)} style={IS} />
            </div>
            <div><label style={LS}>Cargo</label>
              <input value={emp.rlCargo} onChange={e => ef("rlCargo")(e.target.value)} placeholder="Ej. Representante Legal, Gerente..." style={IS} />
            </div>
            <div><label style={LS}>Profesión</label>
              <input value={emp.rlProfesion} onChange={e => ef("rlProfesion")(e.target.value)} style={IS} />
            </div>
          </div>
        </>
      );

      case 3: return (
        <>
          <SecTitle text="Información financiera" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <OptSelect label="Ingresos anuales" value={emp.ingresosAnuales} onChange={ef("ingresosAnuales")} options={EMP_INCOME_RANGES} />
            <OptSelect label="Activos" value={emp.activos} onChange={ef("activos")} options={EMP_ASSETS_RANGES} />
            <OptSelect label="Pasivos" value={emp.pasivos} onChange={ef("pasivos")} options={EMP_LIAB_RANGES} />
            <OptSelect label="Patrimonio" value={emp.patrimonio} onChange={ef("patrimonio")} options={EMP_NETWORTH_RANGES} />
            <OptSelect label="Volumen mensual esperado" value={emp.volumenMensual} onChange={ef("volumenMensual")} options={EMP_VOLUME_RANGES} />
            <OptSelect label="Número estimado de transacciones" value={emp.numTransacciones} onChange={ef("numTransacciones")} options={EMP_TXCOUNT_RANGES} />
            <OptSelect label="Valor promedio por transacción" value={emp.valorPromedioTx} onChange={ef("valorPromedioTx")} options={EMP_AVGTX_RANGES} />
            <OptSelect label="Valor máximo esperado" value={emp.valorMaximoTx} onChange={ef("valorMaximoTx")} options={EMP_MAXTX_RANGES} />
          </div>

          <SecTitle text="Información bancaria" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <CatalogInput label="Banco" value={emp.bancoNombre} onChange={ef("bancoNombre")} items={catalogs.banks} loading={catalogs.loading} listId="banks-emp" />
            <div><label style={LS}>Tipo de cuenta</label>
              <select value={emp.bancoTipoCuenta} onChange={e => ef("bancoTipoCuenta")(e.target.value)} style={IS}>
                <option value="">Selecciona...</option>
                <option>Ahorros</option><option>Corriente</option>
              </select>
            </div>
            <div><label style={LS}>Número de cuenta</label>
              <input value={emp.bancoNumeroCuenta} onChange={e => ef("bancoNumeroCuenta")(e.target.value)} style={IS} />
            </div>
            <div><label style={LS}>Titular</label>
              <input value={emp.bancoTitular} onChange={e => ef("bancoTitular")(e.target.value)} style={IS} />
            </div>
            <CatalogSelect label="País" value={emp.bancoPais} onChange={ef("bancoPais")} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
          </div>
        </>
      );

      case 4: return (
        <>
          <SecTitle text="Accionistas y beneficiarios finales (UBO)" />
          <div style={{ fontSize:"12px", color:"var(--t3)", marginBottom:"14px" }}>
            Agrega cada persona con participación accionaria o control sobre la empresa.
          </div>
          {ubos.map((u, i) => (
            <div key={i} style={{ border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", padding:"16px", marginBottom:"14px", position:"relative" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
                <span style={{ fontSize:"12px", fontWeight:700, color:"var(--t2)" }}>Beneficiario #{i + 1}</span>
                {ubos.length > 1 && (
                  <button type="button" onClick={() => removeUbo(i)}
                    style={{ display:"inline-flex", alignItems:"center", gap:"4px", padding:"3px 9px", border:"1px solid var(--error)", borderRadius:"var(--radius-sm)", background:"transparent", color:"var(--error)", fontSize:"11px", cursor:"pointer" }}>
                    <i className="ti ti-trash" />Eliminar
                  </button>
                )}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
                <div style={{ gridColumn:"1/-1" }}><label style={LS}>Nombre completo <span style={{color:"var(--accent)"}}>*</span></label>
                  <input value={u.full_name} onChange={e => updateUbo(i, "full_name", e.target.value)} style={IS} />
                </div>
                <CatalogSelect label="Tipo de documento" value={u.doc_type} onChange={v => updateUbo(i, "doc_type", v)}
                  items={catalogs.documentTypes} fallback={DOC_TYPE_FALLBACK} loading={catalogs.loading} />
                <div><label style={LS}>Número de documento</label>
                  <input value={u.doc_number} onChange={e => updateUbo(i, "doc_number", e.target.value)} style={IS} />
                </div>
                <CatalogSelect label="Nacionalidad" value={u.nationality} onChange={v => updateUbo(i, "nationality", v)} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
                <CatalogSelect label="País de residencia" value={u.residence_country} onChange={v => updateUbo(i, "residence_country", v)} items={catalogs.countries} fallback={COUNTRY_FALLBACK} loading={catalogs.loading} />
                <div><label style={LS}>Participación accionaria (%)</label>
                  <input type="number" min={0} max={100} value={u.ownership_pct} onChange={e => updateUbo(i, "ownership_pct", e.target.value)} style={IS} />
                </div>
                <OptSelect label="¿Es Persona Expuesta Políticamente (PEP)?" value={u.is_pep} onChange={v => updateUbo(i, "is_pep", v)} options={YES_NO} />
                <OptSelect label="Origen de los fondos" value={u.funds_origin} onChange={v => updateUbo(i, "funds_origin", v)} options={PN_FUNDS_ORIGIN} />
              </div>
            </div>
          ))}
          <button type="button" onClick={addUbo}
            style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"8px 14px", border:"1px dashed var(--border-strong)", borderRadius:"var(--radius-sm)", background:"var(--elevated)", color:"var(--t2)", fontSize:"12px", fontWeight:600, cursor:"pointer" }}>
            <i className="ti ti-plus" />Agregar beneficiario
          </button>
        </>
      );

      case 5: return (
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
          <SecTitle text="Declaraciones" />
          <DeclChecklist defs={EMP_DECL_DEFS} values={empDecls} onToggle={(k, v) => setEmpDecls(p => ({ ...p, [k]: v }))} />
          <div style={{ display:"flex", alignItems:"flex-start", gap:"8px", padding:"12px 0", fontSize:"12px", color:"var(--t2)" }}>
            <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ marginTop:"2px", flexShrink:0 }} />
            <span>Aceptamos los Términos y Condiciones, y autorizamos a Ramplix para verificar los datos suministrados con fines de vinculación.</span>
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
    const isApproved = existingStatus === "approved";
    return (
      <div style={{ animation:"fadeUp .3s ease", maxWidth:"480px", margin:"0 auto", textAlign:"center", padding:"36px 16px" }}>
        <div style={{ width:"60px", height:"60px", borderRadius:"50%", background:"var(--success-dim)", color:"var(--success)", display:"grid", placeItems:"center", margin:"0 auto 18px", fontSize:"28px" }}>
          <i className="ti ti-circle-check" />
        </div>
        <h2 style={{ fontSize:"20px", fontWeight:700, marginBottom:"8px", color:"var(--t1)" }}>{isApproved ? "Cuenta aprobada" : "Solicitud enviada"}</h2>
        <p style={{ color:"var(--t2)", fontSize:"13.5px", lineHeight:1.7, marginBottom:"22px", maxWidth:"360px", margin:"0 auto 22px" }}>
          {isApproved
            ? "Tu solicitud fue aprobada — ya puedes crear tu billetera y empezar a operar."
            : <>Tu información fue recibida. El equipo de Ramplix revisará tu solicitud en <strong>1 a 3 días hábiles</strong>.</>}
        </p>
        <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:"var(--radius)", padding:"16px", maxWidth:"300px", margin:"0 auto 22px" }}>
          {[
            ["Estado",    isApproved
              ? <span style={{ display:"inline-flex", alignItems:"center", gap:"5px", padding:"2px 8px", borderRadius:"20px", fontSize:"11px", fontWeight:600, color:"var(--success)", background:"var(--success-dim)" }}>✓ Aprobado</span>
              : <span style={{ display:"inline-flex", alignItems:"center", gap:"5px", padding:"2px 8px", borderRadius:"20px", fontSize:"11px", fontWeight:600, color:"var(--warning)", background:"var(--warning-dim)" }}>⏳ En revisión</span>],
            ["Solicitud", <code style={{ fontFamily:"var(--mono)", fontSize:"12px", color:"var(--t1)" }}>{solId}</code>],
            ["Siguiente", isApproved ? "Crea tu billetera desde el menú" : "Revisión por el equipo Ramplix"],
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