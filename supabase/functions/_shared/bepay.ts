// supabase/functions/_shared/bepay.ts

export const BEPAY_BASE = "https://app.bepay.com.co/api/v1";

export const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Obtiene el token de Bepay usando email y password
// Bepay no tiene API keys — usa sesión como una app web normal
export async function getBepayToken(): Promise<string> {
  const res = await fetch(`${BEPAY_BASE}/get-access-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept":       "application/json",
    },
    body: JSON.stringify({
      email:    Deno.env.get("BEPAY_EMAIL"),
      password: Deno.env.get("BEPAY_PASSWORD"),
    }),
  });

  const json = await res.json();

  if (!json.success) {
    throw new Error(`Bepay auth falló: ${json.message}`);
  }

  // Retorna el token: "43|Twf760yNIOzPwU5TOsxqHg8dV6XsaOMkkRaeea8f"
  return json.data;
}

// Helper para llamar cualquier endpoint autenticado de Bepay
export async function bepayFetch(
  path: string,
  token: string,
  options: RequestInit = {}
) {
  const res = await fetch(`${BEPAY_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
      "Accept":        "application/json",
      ...(options.headers ?? {}),
    },
  });
  return res.json();
}