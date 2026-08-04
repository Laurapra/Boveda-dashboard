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

          // ── Campos KYC ampliados (todos opcionales por ahora) ──────────
          // 1. Datos personales
          commercial_name:    p.commercial_name ?? `${p.first_name} ${p.middle_name ?? ""} ${p.first_surname} ${p.middle_surname ?? ""}`.replace(/\s+/g, " ").trim(),
          nationality:        p.nationality ?? null,
          birth_country:      p.birth_country ?? null,
          sex:                p.sex ?? null,
          // 2. Contacto
          residence_country:  p.residence_country ?? null,
          address:            p.address ?? null,
          landline_phone:     p.landline_phone ?? null,
          postal_code:        p.postal_code ?? null,
          // 3. Laboral
          profession:         p.profession ?? null,
          economic_activity:  p.economic_activity ?? null,
          employment_type:    p.employment_type ?? null,
          // 4. Tributaria
          tax_residence_country:     p.tax_residence_country ?? null,
          has_foreign_tax_residence: p.has_foreign_tax_residence ?? null,
          tax_id_tin:                p.tax_id_tin ?? null,
          rut_number:                p.rut_number ?? null,
          tax_regime:                p.tax_regime ?? null,
          is_vat_responsible:        p.is_vat_responsible ?? null,
          // 5. Financiera
          monthly_expenses_range: p.monthly_expenses_range ?? null,
          net_worth_range:        p.net_worth_range ?? null,
          funds_origin_other:     p.funds_origin_other ?? null,
          income_source:          p.income_source ?? null,
          income_source_other:    p.income_source_other ?? null,
          monthly_volume_range:   p.monthly_volume_range ?? null,
          monthly_tx_count_range: p.monthly_tx_count_range ?? null,
          avg_tx_value_range:     p.avg_tx_value_range ?? null,
          max_tx_value_range:     p.max_tx_value_range ?? null,
          // 6. Cumplimiento
          is_pep:          p.is_pep ?? null,
          pep_details:     p.pep_details ?? null,
          is_pep_related:  p.is_pep_related ?? null,
          // 7. Bancaria
          bank_name:              p.bank_name ?? null,
          bank_account_type:      p.bank_account_type ?? null,
          bank_account_number:    p.bank_account_number ?? null,
          bank_account_holder:    p.bank_account_holder ?? null,
          bank_holder_doc_type:   p.bank_holder_doc_type ?? null,
          bank_holder_doc_number: p.bank_holder_doc_number ?? null,
          bank_country:           p.bank_country ?? null,
          bank_currency:          p.bank_currency ?? null,
          // 9. Declaraciones
          decl_truthful_info:     p.decl_truthful_info ?? null,
          decl_lawful_funds:      p.decl_lawful_funds ?? null,
          decl_data_processing:   p.decl_data_processing ?? null,
          decl_privacy_policy:    p.decl_privacy_policy ?? null,
          decl_screening_consent: p.decl_screening_consent ?? null,
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

          // ── Campos KYB ampliados (todos opcionales por ahora) ──────────
          // 1. General
          commercial_name:       p.commercial_name ?? null,
          business_description:  p.business_description ?? null,
          incorporation_country: p.incorporation_country ?? null,
          address:               p.address ?? null,
          postal_code:           p.postal_code ?? null,
          // 2. Tributaria
          tax_regime:            p.tax_regime ?? null,
          is_vat_responsible:    p.is_vat_responsible ?? null,
          is_gran_contribuyente: p.is_gran_contribuyente ?? null,
          is_autorretenedor:     p.is_autorretenedor ?? null,
          tax_residence_country: p.tax_residence_country ?? null,
          tax_countries:         p.tax_countries ?? null,
          // 3. Representante legal (partes sueltas, además de rl_full_name)
          rl_first_name:     p.rl_first_name ?? null,
          rl_middle_name:    p.rl_middle_name ?? null,
          rl_first_surname:  p.rl_first_surname ?? null,
          rl_middle_surname: p.rl_middle_surname ?? null,
          rl_nationality:    p.rl_nationality ?? null,
          rl_birth_country:  p.rl_birth_country ?? null,
          rl_sex:            p.rl_sex ?? null,
          rl_address:        p.rl_address ?? null,
          rl_position:       p.rl_position ?? null,
          rl_profession:     p.rl_profession ?? null,
          // 5. Financiera
          annual_income_range:    p.annual_income_range ?? null,
          assets_range:           p.assets_range ?? null,
          liabilities_range:      p.liabilities_range ?? null,
          net_worth_range:        p.net_worth_range ?? null,
          monthly_volume_range:   p.monthly_volume_range ?? null,
          monthly_tx_count_range: p.monthly_tx_count_range ?? null,
          avg_tx_value_range:     p.avg_tx_value_range ?? null,
          max_tx_value_range:     p.max_tx_value_range ?? null,
          // 6. Bancaria
          bank_name:           p.bank_name ?? null,
          bank_account_type:   p.bank_account_type ?? null,
          bank_account_number: p.bank_account_number ?? null,
          bank_account_holder: p.bank_account_holder ?? null,
          bank_country:        p.bank_country ?? null,
          // 8. Declaraciones
          decl_truthful_info:      p.decl_truthful_info ?? null,
          decl_lawful_funds:       p.decl_lawful_funds ?? null,
          decl_data_processing:    p.decl_data_processing ?? null,
          decl_privacy_policy:     p.decl_privacy_policy ?? null,
          decl_screening_consent:  p.decl_screening_consent ?? null,
          decl_sarlaft_compliance: p.decl_sarlaft_compliance ?? null,
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

      // ── Guardar accionistas / beneficiarios finales (UBO) de una empresa ──
      // Reemplaza la lista completa cada vez que se llama (simple y suficiente
      // para un formulario que se reenvía completo).
      case "save_ubos": {
        const { onboarding_emp_id, beneficiaries } = payload;
        if (!onboarding_emp_id) throw new Error("onboarding_emp_id requerido");
        if (!Array.isArray(beneficiaries)) throw new Error("beneficiaries debe ser una lista");

        // Verificar que la empresa sea del usuario actual (o que sea admin)
        const { data: owner } = await userClient
          .from("onboarding_emp")
          .select("id")
          .eq("id", onboarding_emp_id)
          .eq("user_id", user.id)
          .single();
        if (!owner) {
          const { data: roleCheck } = await userClient.from("profiles").select("role").eq("id", user.id).single();
          if (roleCheck?.role !== "admin") throw new Error("No autorizado para esta empresa");
        }

        await adminClient.from("onboarding_emp_ubo").delete().eq("onboarding_emp_id", onboarding_emp_id);

        if (beneficiaries.length > 0) {
          const rows = beneficiaries.map((b: Record<string, unknown>) => ({
            onboarding_emp_id,
            full_name:         b.full_name,
            doc_type:          b.doc_type ?? null,
            doc_number:        b.doc_number ?? null,
            nationality:       b.nationality ?? null,
            residence_country: b.residence_country ?? null,
            ownership_pct:     b.ownership_pct ?? null,
            is_pep:            b.is_pep ?? null,
            funds_origin:      b.funds_origin ?? null,
          }));
          const { error: uboErr } = await adminClient.from("onboarding_emp_ubo").insert(rows);
          if (uboErr) throw new Error(uboErr.message);
        }

        result = { success: true, count: beneficiaries.length };
        break;
      }

      // ── Consultar estado del onboarding ───────────────────────
      case "get_status": {
        const [pnRes, empRes] = await Promise.all([
          userClient.from("onboarding_pn").select("id, status, submitted_at, breb_registered, breb_reference").eq("user_id", user.id).single(),
          userClient.from("onboarding_emp").select("id, status, submitted_at, breb_registered, breb_reference").eq("user_id", user.id).single(),
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
        // la misma que se usa después al registrar la llave en create_virtual_key
        // (bepay-charges), porque Bepay vincula la llave a este usuario Bre-b a
        // través de este campo.
        //
        // IMPORTANTE — causa raíz de todo el ciclo de errores anteriores: la
        // fórmula para construir esta referencia cambió varias veces mientras
        // depurábamos (4 dígitos, 6 dígitos, mayúsculas, minúsculas...). Cada
        // vez que cambiaba, este endpoint intentaba registrar de nuevo a la
        // MISMA persona con una referencia DISTINTA, y Bepay ahora responde
        // "Entrada duplicada, ya existe un comercio activo con los datos
        // ingresados" (CA003) — no deja re-registrar el mismo documento bajo
        // otra referencia. Mientras tanto create_virtual_key recalculaba su
        // propia referencia con la fórmula más reciente, casi nunca la misma
        // que Bepay realmente había aceptado.
        //
        // Por eso ahora la referencia se calcula UNA SOLA VEZ y se guarda en
        // onboarding_pn.breb_reference / onboarding_emp.breb_reference; todo
        // reintento posterior reutiliza ese mismo valor en vez de recalcularlo,
        // y create_virtual_key lee esa misma columna en vez de tener su propia
        // fórmula. Así, aunque el código vuelva a cambiar en el futuro, una
        // persona ya registrada no se ve afectada.
        const obDocNumber = type === "pn" ? ob.doc_number : ob.nit;
        const obLast3 = obDocNumber ? String(obDocNumber).replace(/\D/g, "").slice(-3).padStart(3, "0") : null;
        const computedReference = obLast3
          ? `ramplix${obLast3}`
          : `ramplix${String(ob.user_id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toLowerCase().padEnd(3, "0")}`;
        const brebReference = ob.breb_reference || computedReference;

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
          gender:          ob.sex === "Femenino" ? "Femenino" : "Masculino",
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
          // Preferimos los campos separados (rl_first_name, etc.) si ya existen
          // — más confiable que partir rl_full_name por espacios, que falla con
          // apellidos compuestos o un solo nombre.
          first_name:      ob.rl_first_name ?? ob.rl_full_name.split(" ")[0] ?? ob.rl_full_name,
          first_surname:   ob.rl_first_surname ?? (ob.rl_full_name.split(" ").slice(1).join(" ") || ob.rl_full_name),
          dane_code:       ob.dane_code ?? "11001",
          // Mismo resguardo que en persona natural: si business_name es un
          // placeholder o muy corto, Bepay lo rechaza por tamaño.
          commerce_name: (() => {
            const raw = (ob.business_name ?? "").trim();
            const placeholder = /^(na|n\/a|ninguna|ninguno|no aplica|-)$/i.test(raw);
            return raw.length >= 3 && !placeholder ? raw : `Comercio ${ob.rl_full_name}`;
          })(),
          email:           ob.email,
          gender:          ob.rl_sex === "Femenino" ? "Femenino" : "Masculino",
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

        // CA003 = "ya existe un comercio activo con los datos ingresados".
        // Esto NO es un error de nuestro código: significa que este documento
        // ya fue registrado como comercio en Bepay en algún intento anterior,
        // bajo una referencia que ya no conocemos (porque la fórmula cambió).
        // `force` no sirve para saltarse esto (solo evita el caché del QR).
        // No hay forma de recuperar esa referencia vieja desde nuestro lado —
        // hay que usar un documento nuevo o pedirle a Bepay que lo revise.
        const isDuplicate = bepayJson?.data?.code === "CA003"
          || (typeof bepayJson?.message === "string" && /ya existe.*comercio/i.test(bepayJson.message))
          || (typeof bepayJson?.message === "object" && JSON.stringify(bepayJson.message).match(/CA003|ya existe.*comercio/i));

        // Solo guardamos breb_reference la PRIMERA vez que se registra con
        // éxito (si ya tenía una guardada, no la pisamos).
        const updatePayload: Record<string, unknown> = {
          breb_registered: bepayJson.success === true,
          breb_response:   bepayJson,
          updated_at:      new Date().toISOString(),
        };
        if (bepayJson.success === true && !ob.breb_reference) {
          updatePayload.breb_reference = brebReference;
        }
        await adminClient.from(obTable).update(updatePayload).eq("id", onboarding_id);

        await adminClient.from("audit_log").insert({
          user_id:   user.id,
          action:    "BREB_REGISTER_AUTO",
          entity:    obTable,
          entity_id: onboarding_id,
          metadata:  { success: bepayJson.success, message: bepayJson.message, duplicate: isDuplicate },
        });

        result = {
          success: bepayJson.success,
          breb_response: bepayJson,
          message: bepayJson.success
            ? "Registrado exitosamente en Bepay Bre-B"
            : isDuplicate
              ? "Este documento ya está registrado como comercio en Bepay bajo una referencia anterior que ya no conocemos (probablemente de una prueba pasada). No se puede re-registrar con una referencia nueva — usa un documento distinto para pruebas, o pide a Bepay que revise/libere ese registro."
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