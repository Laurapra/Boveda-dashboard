// supabase/functions/onboarding/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitize(v: unknown, max = 200): string {
  if (typeof v !== "string" || !v.trim()) throw new Error("Campo requerido vacío");
  return v.trim().slice(0, max);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Sesión inválida");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, payload } = await req.json();

    // ── Verificar perfil activo ────────────────────────────────
    const { data: profile } = await userClient
      .from("profiles").select("is_active, full_name").eq("id", user.id).single();
    if (!profile?.is_active) throw new Error("Cuenta desactivada");

    let result: unknown;

    switch (action) {

      // ── Guardar onboarding PN ─────────────────────────────────
      case "submit_pn": {
        const p = payload;

        // Validar campos críticos
        const required = ["doc_type","doc_number","doc_issue_date","first_name","first_surname","date_of_birth","email","phone","res_dep","res_mun","res_dane","funds_origin"];
        for (const f of required) {
          if (!p[f]) throw new Error(`Campo requerido: ${f}`);
        }
        if (!p.terms_accepted) throw new Error("Debes aceptar los términos y condiciones");

        // Upsert — si ya existe actualiza
        const { data, error } = await adminClient.from("onboarding_pn").upsert({
          user_id:          user.id,
          doc_type:         sanitize(p.doc_type),
          doc_number:       sanitize(p.doc_number),
          doc_issue_date:   p.doc_issue_date,
          doc_issue_dep:    p.doc_issue_dep ?? null,
          doc_issue_mun:    p.doc_issue_mun ?? null,
          first_name:       sanitize(p.first_name, 25),
          middle_name:      p.middle_name ? sanitize(p.middle_name, 25) : null,
          first_surname:    sanitize(p.first_surname, 25),
          middle_surname:   p.middle_surname ? sanitize(p.middle_surname, 25) : null,
          date_of_birth:    p.date_of_birth,
          birth_dep:        p.birth_dep ?? null,
          birth_mun:        p.birth_mun ?? null,
          birth_dane:       p.birth_dane ?? null,
          email:            sanitize(p.email, 100),
          phone:            sanitize(p.phone, 15),
          phone_alt:        p.phone_alt ?? null,
          res_dep:          sanitize(p.res_dep),
          res_mun:          sanitize(p.res_mun),
          res_dane:         sanitize(p.res_dane, 10),
          occupation:       p.occupation ?? null,
          company:          p.company ?? null,
          job_title:        p.job_title ?? null,
          income_range:     p.income_range ?? null,
          funds_origin:     sanitize(p.funds_origin),
          terms_accepted:   true,
          status:           "pending",
          submitted_at:     new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        }, { onConflict: "user_id" }).select().single();

        if (error) throw new Error(error.message);

        // Audit log
        await adminClient.from("audit_log").insert({
          user_id:   user.id,
          action:    "ONBOARDING_PN_SUBMIT",
          entity:    "onboarding_pn",
          entity_id: data?.id,
          metadata:  { doc_type: p.doc_type, full_name: `${p.first_name} ${p.first_surname}` },
        });

        // Intentar registrar en Bepay Bre-B automáticamente
        try {
          const bepayRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/bepay-charges`, {
            method: "POST",
            headers: { "Authorization": authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "breb_register",
              payload: {
                mobile_number:   p.phone.replace(/\D/g, ""),
                document_type:   p.doc_type === "Cédula (CC)" ? "CC" : p.doc_type === "Extranjería (CE)" ? "CE" : "PAS",
                document_number: p.doc_number,
                first_name:      p.first_name,
                middle_name:     p.middle_name ?? "",
                first_surname:   p.first_surname,
                middle_surname:  p.middle_surname ?? "",
                dane_code:       p.res_dane,
                commerce_name:   p.company || `${p.first_name} ${p.first_surname}`,
                email:           p.email,
                gender:          p.gender ?? "Masculino",
                address:         p.address ?? `Ciudad DANE ${p.res_dane}`,
                birth_place:     p.birth_mun ?? "Colombia",
                dob:             p.date_of_birth,
                issue_date:      p.doc_issue_date,
              },
            }),
          });
          const bepayJson = await bepayRes.json();
          // Guarda la respuesta de Bepay en el registro
          await adminClient.from("onboarding_pn")
            .update({ breb_registered: bepayJson.success === true, breb_response: bepayJson })
            .eq("user_id", user.id);
        } catch { /* Si Bepay falla, el onboarding se guarda igual */ }

        result = { success: true, id: data?.id, status: "pending" };
        break;
      }

      // ── Guardar onboarding Empresa ────────────────────────────
      case "submit_emp": {
        const p = payload;

        const required = ["business_name","nit","email","funds_origin","rl_full_name","rl_doc_type","rl_doc_number"];
        for (const f of required) {
          if (!p[f]) throw new Error(`Campo requerido: ${f}`);
        }
        if (!p.terms_accepted) throw new Error("Debes aceptar los términos y condiciones");

        const { data, error } = await adminClient.from("onboarding_emp").upsert({
          user_id:              user.id,
          business_name:        sanitize(p.business_name, 100),
          nit:                  sanitize(p.nit, 20),
          business_type:        p.business_type ?? null,
          incorporation_date:   p.incorporation_date ?? null,
          city:                 p.city ?? null,
          department:           p.department ?? null,
          dane_code:            p.dane_code ?? null,
          email:                sanitize(p.email, 100),
          phone:                p.phone ?? null,
          website:              p.website ?? null,
          economic_activity:    p.economic_activity ?? null,
          funds_origin:         sanitize(p.funds_origin),
          rl_full_name:         sanitize(p.rl_full_name, 100),
          rl_doc_type:          sanitize(p.rl_doc_type),
          rl_doc_number:        sanitize(p.rl_doc_number, 20),
          rl_doc_issue_date:    p.rl_doc_issue_date ?? null,
          rl_doc_issue_dep:     p.rl_doc_issue_dep ?? null,
          rl_doc_issue_mun:     p.rl_doc_issue_mun ?? null,
          rl_date_of_birth:     p.rl_date_of_birth ?? null,
          rl_birth_dep:         p.rl_birth_dep ?? null,
          rl_birth_mun:         p.rl_birth_mun ?? null,
          rl_email:             p.rl_email ?? null,
          rl_phone:             p.rl_phone ?? null,
          terms_accepted:       true,
          status:               "pending",
          submitted_at:         new Date().toISOString(),
          updated_at:           new Date().toISOString(),
        }, { onConflict: "user_id" }).select().single();

        if (error) throw new Error(error.message);

        await adminClient.from("audit_log").insert({
          user_id:   user.id,
          action:    "ONBOARDING_EMP_SUBMIT",
          entity:    "onboarding_emp",
          entity_id: data?.id,
          metadata:  { business_name: p.business_name, nit: p.nit },
        });

        result = { success: true, id: data?.id, status: "pending" };
        break;
      }

      // ── Consultar estado del onboarding ───────────────────────
      case "get_status": {
        const [pnRes, empRes] = await Promise.all([
          userClient.from("onboarding_pn").select("id, status, submitted_at, breb_registered").eq("user_id", user.id).single(),
          userClient.from("onboarding_emp").select("id, status, submitted_at, breb_registered").eq("user_id", user.id).single(),
        ]);
        result = {
          success: true,
          pn:  pnRes.data  ?? null,
          emp: empRes.data ?? null,
        };
        break;
      }

      // ── Subir documento ───────────────────────────────────────
      case "get_upload_url": {
        const docType = sanitize(payload?.doc_type, 50); // "doc_front", "selfie", etc.
        const ext     = sanitize(payload?.ext ?? "jpg", 5);
        const path    = `${user.id}/${docType}-${Date.now()}.${ext}`;

        const { data, error } = await adminClient.storage
          .from("onboarding-docs")
          .createSignedUploadUrl(path);

        if (error) throw new Error(error.message);
        result = { success: true, url: data.signedUrl, path };
        break;
      }

      // ── Admin: aprobar/rechazar onboarding ────────────────────
      case "review": {
        const { data: adminProfile } = await userClient.from("profiles").select("role").eq("id", user.id).single();
        if (adminProfile?.role !== "admin") throw new Error("No autorizado");

        const { target_id, type, status: newStatus, reason } = payload;
        if (!["approved","rejected","in_review"].includes(newStatus)) throw new Error("Estado inválido");

        const table = type === "pn" ? "onboarding_pn" : "onboarding_emp";
        await adminClient.from(table).update({
          status:           newStatus,
          rejection_reason: reason ?? null,
          reviewed_at:      new Date().toISOString(),
        }).eq("id", target_id);

        await adminClient.from("audit_log").insert({
          user_id:   user.id,
          action:    `ONBOARDING_${type.toUpperCase()}_${newStatus.toUpperCase()}`,
          entity:    table,
          entity_id: target_id,
          metadata:  { reason },
        });

        result = { success: true };
        break;
      }

      default:
        return new Response(JSON.stringify({ success: false, error: `Acción '${action}' no reconocida` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[onboarding]", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});