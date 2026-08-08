-- ============================================================================
-- Columnas para guardar las URLs de los documentos subidos en el Onboarding.
--
-- El formulario (Onboarding.tsx) siempre ha subido los archivos a Storage
-- (bucket "onboarding-docs") y ha enviado sus rutas en el payload de
-- submit_pn/submit_emp (doc_front_url, selfie_url, chamber_commerce_url,
-- etc.), pero esas columnas nunca existieron en onboarding_pn/onboarding_emp
-- y el backend (supabase/functions/onboarding/index.ts) nunca las guardaba
-- — los documentos quedaban en el bucket pero sin ningún registro que
-- apunte a ellos desde la solicitud. Se agregan aquí, junto con las dos
-- columnas nuevas para "Certificado bancario" y "Extractos bancarios o
-- Declaración de renta" que pide la lista de documentos requeridos.
-- ============================================================================

ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS doc_front_url TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS doc_back_url TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS selfie_url TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_certificate_url TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_statement_or_tax_return_url TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS funds_decl_url TEXT;

ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS chamber_commerce_url TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rut_url TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_doc_front_url TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_doc_back_url TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS funds_decl_url TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS financial_states_url TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS shareholder_comp_url TEXT;
