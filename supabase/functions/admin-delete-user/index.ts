// supabase/functions/admin-delete-user/index.ts
//
// "Borrado seguro" — decidido explícitamente sobre la alternativa de borrado
// total, porque este es un sistema de pagos con KYC/KYB y declaraciones
// SARLAFT: las transacciones (bepay_transactions), llaves Bre-b (breb_keys)
// y el log de auditoría (audit_log) NO se tocan — se conservan intactos
// para cumplimiento/trazabilidad financiera. Lo que sí se elimina es:
//   1. El acceso — se banea la cuenta en Supabase Auth (no se borra el
//      usuario de Auth: profiles.id referencia auth.users.id y no sabemos
//      con certeza si hay ON DELETE CASCADE configurado; borrar el usuario
//      de Auth podría arrastrar en cascada las filas que justo queremos
//      conservar).
//   2. Los datos personales (KYC/KYB): onboarding_pn, onboarding_emp (+ sus
//      beneficiarios finales/UBO) y las cuentas bancarias/beneficiarios que
//      el usuario haya registrado.
//   3. El perfil se anonimiza (nombre y correo) en vez de borrarse, para que
//      las transacciones históricas sigan teniendo a qué perfil apuntar.
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

    const { data: callerProfile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerProfile?.role !== "admin") throw new Error("No autorizado — solo admins");

    const { target_user_id } = await req.json();
    if (!target_user_id) throw new Error("Falta target_user_id");
    if (target_user_id === user.id) throw new Error("No puedes eliminar tu propia cuenta de admin");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .eq("id", target_user_id)
      .single();

    if (!targetProfile) throw new Error("Usuario no encontrado");

    // ── Borrar datos personales (KYC/KYB + contactos) ──────────────────
    // Cada bloque va en su propio try/catch: si alguna tabla no existe o
    // no tiene filas para este usuario, no debe tumbar todo el proceso.
    const safeDelete = async (label: string, fn: () => Promise<{ error: { message: string } | null }>) => {
      try {
        const { error } = await fn();
        if (error) console.error(`[admin-delete-user] ${label}:`, error.message);
      } catch (e) {
        console.error(`[admin-delete-user] ${label} (excepción):`, e instanceof Error ? e.message : String(e));
      }
    };

    const { data: benRows } = await adminClient
      .from("beneficiaries")
      .select("id")
      .eq("user_id", target_user_id);
    const benIds = (benRows ?? []).map((b: { id: string }) => b.id);

    if (benIds.length > 0) {
      await safeDelete("beneficiary_accounts", () =>
        adminClient.from("beneficiary_accounts").delete().in("beneficiary_id", benIds)
      );
    }
    await safeDelete("beneficiaries", () =>
      adminClient.from("beneficiaries").delete().eq("user_id", target_user_id)
    );
    await safeDelete("bank_accounts", () =>
      adminClient.from("bank_accounts").delete().eq("user_id", target_user_id)
    );

    const { data: empRows } = await adminClient
      .from("onboarding_emp")
      .select("id")
      .eq("user_id", target_user_id);
    const empIds = (empRows ?? []).map((e: { id: string }) => e.id);

    if (empIds.length > 0) {
      await safeDelete("onboarding_emp_ubo", () =>
        adminClient.from("onboarding_emp_ubo").delete().in("onboarding_emp_id", empIds)
      );
    }
    await safeDelete("onboarding_emp", () =>
      adminClient.from("onboarding_emp").delete().eq("user_id", target_user_id)
    );
    await safeDelete("onboarding_pn", () =>
      adminClient.from("onboarding_pn").delete().eq("user_id", target_user_id)
    );

    // ── Anonimizar el perfil (no se borra — lo referencian transacciones) ──
    const { error: profileErr } = await adminClient
      .from("profiles")
      .update({
        full_name: "Usuario eliminado",
        email: `eliminado-${target_user_id}@ramplix.local`,
        is_active: false,
      })
      .eq("id", target_user_id);

    if (profileErr) throw new Error("Error anonimizando el perfil: " + profileErr.message);

    // ── Bloquear el acceso a Auth sin borrar el usuario ────────────────
    // ban_duration muy largo = baneo permanente en la práctica, sin tocar
    // la fila de auth.users (y por lo tanto sin riesgo de cascada).
    const { error: banErr } = await adminClient.auth.admin.updateUserById(target_user_id, {
      ban_duration: "876000h",
    });
    if (banErr) console.error("[admin-delete-user] No se pudo banear en Auth:", banErr.message);

    await adminClient.from("audit_log").insert({
      user_id: user.id,
      action: "ADMIN_DELETE_USER",
      entity: "profiles",
      entity_id: target_user_id,
      metadata: { deleted_by: user.id },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
