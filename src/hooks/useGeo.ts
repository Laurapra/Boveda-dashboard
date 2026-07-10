// src/hooks/useGeo.ts
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export interface BepayRegion {
  id: number;
  name: string;
  code: string;
  country_id: number;
}

export interface BepayCity {
  id: number;
  name: string;
  region_id: number;
  region_name: string;
  region_code: string;
  country_id: number;
  // Bepay no devuelve DANE directamente — lo mapeamos desde nuestro diccionario
  dane_code?: string;
}

// Mapeo region_code → dane_code para las principales ciudades
// Bepay usa sus propios IDs numéricos, este diccionario mapea el code a DANE
const DANE_BY_CITY: Record<string, string> = {
  "Bogotá D.C.":          "11001",
  "Medellín":             "05001",
  "Barranquilla":         "08001",
  "Cali":                 "76001",
  "Cartagena":            "13001",
  "Bucaramanga":          "68001",
  "Soledad":              "08675",
  "Cúcuta":               "54001",
  "Ibagué":               "73001",
  "Pereira":              "66001",
  "Santa Marta":          "47001",
  "Manizales":            "17001",
  "Neiva":                "41001",
  "Villavicencio":        "50001",
  "Armenia":              "63001",
  "Valledupar":           "20001",
  "Montería":             "23001",
  "Pasto":                "52001",
  "Sincelejo":            "70001",
  "Popayán":              "19001",
  "Floridablanca":        "68276",
  "Envigado":             "05266",
  "Soacha":               "25754",
  "Bello":                "05088",
  "Buenaventura":         "76111",
  "Itagüí":               "05360",
  "Dosquebradas":         "66170",
  "Palmira":              "76520",
  "Tunja":                "15001",
  "Rionegro":             "05615",
  "Malambo":              "08433",
  "Baranoa":              "08078",
  "Puerto Colombia":      "08573",
  "Magangué":             "13430",
  "Turbaco":              "13780",
  "Duitama":              "15238",
  "Sogamoso":             "15693",
  "La Dorada":            "17380",
  "Santander de Quilichao": "19698",
  "Aguachica":            "20011",
  "Lorica":               "23417",
  "Cereté":               "23162",
  "Fusagasugá":           "25290",
  "Chía":                 "25175",
  "Zipaquirá":            "25899",
  "Facatativá":           "25269",
  "Pitalito":             "41503",
  "Riohacha":             "44001",
  "Maicao":               "44430",
  "Ciénaga":              "47189",
  "Acacías":              "50006",
  "Tumaco":               "52835",
  "Ocaña":                "54518",
  "Girón":                "68307",
  "Corozal":              "70110",
  "Melgar":               "73449",
  "Tuluá":                "76834",
  "San Andrés":           "88001",
  "Leticia":              "91001",
  "Arauca":               "81001",
  "Florencia":            "18001",
  "Yopal":                "85001",
  "Quibdó":               "27001",
  "Inírida":              "94001",
  "San José del Guaviare": "95001",
  "Mocoa":                "86001",
  "Mitú":                 "97001",
  "Puerto Carreño":       "99001",
};

export function getDane(cityName: string): string {
  return DANE_BY_CITY[cityName] ?? "";
}

export function useGeo() {
  const [regions, setRegions]   = useState<BepayRegion[]>([]);
  const [cities,  setCities]    = useState<BepayCity[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Primero intenta desde el caché de Supabase
      const { data: cached } = await supabase
        .from("geo_cache")
        .select("data, updated_at")
        .eq("key", "colombia_geo")
        .single();

      if (cached) {
        const age = Date.now() - new Date(cached.updated_at).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          // Caché válido
          const geo = cached.data as { regions: BepayRegion[]; cities: BepayCity[] };
          setRegions(geo.regions.sort((a,b) => a.name.localeCompare(b.name,"es")));
          setCities(geo.cities.map(c => ({ ...c, dane_code: getDane(c.name) })));
          setLoading(false);
          return;
        }
      }

      // Caché expirado o no existe — llama a Bepay via Edge Function
      const { data, error: fnErr } = await supabase.functions.invoke("bepay-charges", {
        body: { action: "get_colombia_geo", payload: {} },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (!data?.success) throw new Error("Error obteniendo geografía");

      const geo = data.data as { regions: BepayRegion[]; cities: BepayCity[] };
      setRegions(geo.regions.sort((a,b) => a.name.localeCompare(b.name,"es")));
      setCities(geo.cities.map(c => ({ ...c, dane_code: getDane(c.name) })));

    } catch (err: any) {
      setError(err.message);
      // Fallback a datos hardcodeados si Bepay falla
      console.warn("Usando datos geográficos locales como fallback");
    } finally {
      setLoading(false);
    }
  };

  // Filtra ciudades por región
  const getCitiesByRegion = (regionId: number) =>
    cities.filter(c => c.region_id === regionId);

  // Filtra regiones por código
  const getRegionByCode = (code: string) =>
    regions.find(r => r.code === code);

  return { regions, cities, loading, error, getCitiesByRegion, getRegionByCode, getDane, reload: load };
}