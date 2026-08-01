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

        // NOTA: antes aquí se intentaba registrar a la persona en Bepay Bre-b
        // automáticamente, apenas enviaba el formulario — sin revisión de un
        // admin y sin la referencia (RAMPLIX+últimos 4 de cédula) que usa
        // create_virtual_key. Eso registraba a todos con reference:null, y
        // cuando el admin aprobaba después, Bepay ya tenía a esa persona
        // registrada con la referencia incorrecta ("Subscriber with same
        // Identification No. already exists" al intentar corregirlo). El
        // registro real en Bepay ahora SOLO ocurre cuando el admin aprueba
        // (acción "register_in_bepay" más abajo), con la referencia correcta.

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

      // ── Admin: registrar el onboarding aprobado en Bepay Bre-B ─
      case "register_in_bepay": {
        // Solo admin puede hacer esto
        const { data: adminProfile2 } = await userClient
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (adminProfile2?.role !== "admin") throw new Error("No autorizado");

        const { onboarding_id, type, force } = payload;
        if (!onboarding_id || !type) throw new Error("onboarding_id y type requeridos");

        const obTable = type === "pn" ? "onboarding_pn" : "onboarding_emp";

        // Traer datos del onboarding
        const { data: ob, error: obErr } = await adminClient
          .from(obTable)
          .select("*")
          .eq("id", onboarding_id)
          .single();

        if (obErr || !ob) throw new Error("Onboarding no encontrado");
        // `force` permite reintentar aunque ya esté marcado como registrado —
        // necesario porque intentos previos pudieron haber quedado marcados
        // breb_registered=true con datos incorrectos (ej. sin reference).
        if (ob.breb_registered && !force) {
          result = { success: true, message: "Ya estaba registrado en Bepay" };
          break;
        }

        // Referencia estable del "usuario/subcuenta Bre-b" — debe ser EXACTAMENTE
        // la misma que se usará después al registrar la llave en create_virtual_key
        // (bepay-charges), porque Bepay vincula la llave a este usuario Bre-b a
        // través de este campo. Antes no se enviaba ninguna referencia aquí, y
        // create_virtual_key mandaba la nota interna del usuario ("Referencia
        // opcional" del modal) como si fuera esa referencia — nunca coincidían,
        // por eso Bepay respondía "No se encontró el usuario Bre-b para la cuenta".
        const obDocNumber = type === "pn" ? ob.doc_number : ob.nit;
        const obLast4 = obDocNumber ? String(obDocNumber).replace(/\D/g, "").slice(-4) : null;
        const brebReference = obLast4 && obLast4.length === 4
          ? `RAMPLIX${obLast4}`
          : `RAMPLIX${String(ob.user_id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}`;

        // Llamar a bepay-charges → breb_register con los datos del onboarding.
        // `force: true` le dice a Bepay que sobreescriba/actualice el suscriptor
        // si ya existe uno con esa misma identificación (caso "Subscriber with
        // same Identification No. already exists") — necesario en reintentos,
        // porque intentos previos de esta misma persona pudieron haber quedado
        // registrados con la referencia vieja (nula/incorrecta).
        // "company" en el onboarding es opcional y mucha gente pone algo como
        // "NA" o "-" cuando no aplica — eso hace que Bepay rechace commerce_name
        // por ser demasiado corto ("commerceName: commerce_name.size"). Si no
        // parece un nombre real de negocio, usamos el nombre completo en su lugar.
        const companyRaw = (ob.company ?? "").trim();
        const looksLikePlaceholder = /^(na|n\/a|ninguna|ninguno|no aplica|-)$/i.test(companyRaw);
        const commerceName = companyRaw.length >= 3 && !looksLikePlaceholder
          ? companyRaw
          : `${ob.first_name} ${ob.first_surname}`;

        const bepayPayload = type === "pn" ? {
          reference:       brebReference,
          force:           !!force,
          mobile_number:   ob.phone?.replace(/\D/g, "") ?? "",
          document_type:   ob.doc_type,
          document_number: ob.doc_number,
          first_name:      ob.first_name,
          middle_name:     ob.middle_name ?? "",
          first_surname:   ob.first_surname,
          middle_surname:  ob.middle_surname ?? "",
          dane_code:       ob.res_dane,
          commerce_name:   commerceName,
          email:           ob.email,
          gender:          "Masculino",
          address:         ob.address ?? `Ciudad DANE ${ob.res_dane}`,
          birth_place:     ob.birth_mun ?? "Colombia",
          dob:             ob.date_of_birth,
          issue_date:      ob.doc_issue_date,
        } : {
          reference:       brebReference,
          force:           !!force,
          mobile_number:   ob.phone?.replace(/\D/g, "") ?? "",
          document_type:   ob.rl_doc_type,
          document_number: ob.rl_doc_number,
          first_name:      ob.rl_full_name.split(" ")[0] ?? ob.rl_full_name,
          first_surname:   ob.rl_full_name.split(" ").slice(1).join(" ") || ob.rl_full_name,
          dane_code:       ob.dane_code ?? "11001",
          // Mismo resguardo que en persona natural: si business_name es un
          // placeholder o muy corto, Bepay lo rechaza por tamaño.
          commerce_name: (() => {
            const raw = (ob.business_name ?? "").trim();
            const placeholder = /^(na|n\/a|ninguna|ninguno|no aplica|-)$/i.test(raw);
            return raw.length >= 3 && !placeholder ? raw : `Comercio ${ob.rl_full_name}`;
          })(),
          email:           ob.email,
          gender:          "Masculino",
          address:         ob.address ?? `Ciudad DANE ${ob.dane_code ?? "11001"}`,
          birth_place:     ob.rl_birth_mun ?? "Colombia",
          dob:             ob.rl_date_of_birth ?? "1990-01-01",
          issue_date:      ob.rl_doc_issue_date ?? "2010-01-01",
        };

        // Llamar a la función bepay-charges con el token del admin
        const bepayRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/bepay-charges`, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({ action: "breb_register", payload: bepayPayload }),
        });
        const bepayJson = await bepayRes.json();
        console.log("Bepay breb_register resultado:", JSON.stringify(bepayJson));

        // Actualizar el estado en la tabla de onboarding
        await adminClient.from(obTable).update({
          breb_registered: bepayJson.success === true,
          breb_response:   bepayJson,
          updated_at:      new Date().toISOString(),
        }).eq("id", onboarding_id);

        await adminClient.from("audit_log").insert({
          user_id:   user.id,
          action:    "BREB_REGISTER_AUTO",
          entity:    obTable,
          entity_id: onboarding_id,
          metadata:  { success: bepayJson.success, message: bepayJson.message },
        });

        result = {
          success: bepayJson.success,
          breb_response: bepayJson,
          message: bepayJson.success
            ? "Registrado exitosamente en Bepay Bre-B"
            : `Bepay respondió: ${JSON.stringify(bepayJson.message)}`,
        };
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