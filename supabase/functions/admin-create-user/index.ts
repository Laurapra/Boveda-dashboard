// supabase/functions/admin-create-user/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const { data: profile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") throw new Error("No autorizado — solo admins");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email, password, full_name, role, tarifa_recibir, tarifa_enviar, tarifa_variable } = await req.json();

    // ── Detecta usuarios "fantasma": existen en Auth pero sin perfil ──
    // Si el email ya existe en Auth, verificamos si tiene perfil.
    // Si NO tiene perfil, es un usuario huérfano de un intento anterior fallido
    // — lo eliminamos y lo recreamos limpio en vez de fallar.
    const { data: existingList } = await adminClient.auth.admin.listUsers();
    const existingAuthUser = existingList?.users?.find((u) => u.email === email);

    if (existingAuthUser) {
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", existingAuthUser.id)
        .single();

      if (!existingProfile) {
        // Usuario huérfano — lo eliminamos para poder recrearlo limpio
        await adminClient.auth.admin.deleteUser(existingAuthUser.id);
      } else {
        throw new Error("Ya existe un usuario activo con este correo");
      }
    }

    // Crear el usuario en Auth
    const { data: newUser, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) throw new Error(authErr.message);
    if (!newUser.user) throw new Error("No se pudo crear el usuario");

    // Insertar el perfil con tarifas personalizadas
    const { error: profileErr } = await adminClient.from("profiles").insert({
      id: newUser.user.id,
      email,
      full_name,
      role,
      tarifa_recibir: tarifa_recibir ?? 1190,
      tarifa_enviar: tarifa_enviar ?? 1190,
      tarifa_variable: tarifa_variable ?? 0.0012,
      is_active: true,
    });

    if (profileErr) {
      // ── Rollback: si el perfil falla, borramos el usuario de Auth ──
      // para no dejar huérfanos que bloqueen futuros intentos con el mismo email.
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      throw new Error("Error creando el perfil: " + profileErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});