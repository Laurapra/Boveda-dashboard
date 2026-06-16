// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// Vite expone las variables de entorno con el prefijo VITE_
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local"
  );
}

// Una sola instancia del cliente — se importa desde cualquier archivo
export const supabase = createClient(supabaseUrl, supabaseAnonKey);