-- ============================================================================
-- Expansión de KYC (Persona Natural) y KYB (Persona Jurídica)
-- ============================================================================
-- Todas las columnas son NULLABLE a propósito: no rompen filas existentes ni
-- el flujo de onboarding actual. El formulario (Onboarding.tsx) se construirá
-- en una fase siguiente para ir llenando estos campos progresivamente.
--
-- Nada de esto se envía a Bepay — es información de cumplimiento/KYC interna
-- de Ramplix. Bepay solo sigue recibiendo el subconjunto de campos que ya
-- usa hoy (documento, nombre, dirección, etc. en supabase/functions/onboarding).
-- ============================================================================


-- ============================================================================
-- 1) onboarding_pn — KYC Persona Natural
-- ============================================================================

-- 1. Datos personales
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS commercial_name   TEXT;      -- autogenerado en el form: nombres + apellidos
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS nationality       TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS birth_country     TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS sex               TEXT;      -- 'Masculino' | 'Femenino'

-- 2. Información de contacto
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS residence_country TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS address           TEXT;      -- no existía; Bepay ya lo necesitaba
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS landline_phone    TEXT;      -- teléfono fijo (opcional)
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS postal_code       TEXT;

-- 3. Información laboral
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS profession         TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS economic_activity  TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS employment_type    TEXT;     -- 'Independiente' | 'Dependiente'

-- 4. Información tributaria
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS tax_residence_country   TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS has_foreign_tax_residence BOOLEAN;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS tax_id_tin              TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS rut_number              TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS tax_regime               TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS is_vat_responsible       BOOLEAN;

-- 5. Información financiera
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS monthly_expenses_range TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS net_worth_range        TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS funds_origin_other     TEXT;   -- "Otro (Especifique)" de origen de fondos
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS income_source          TEXT;   -- fuente principal de ingresos
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS income_source_other    TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS monthly_volume_range   TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS monthly_tx_count_range TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS avg_tx_value_range     TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS max_tx_value_range     TEXT;
-- Nota: income_range (mensual) y funds_origin ya existían — se siguen usando igual.

-- 6. Información de cumplimiento
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS is_pep          BOOLEAN;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS pep_details     TEXT;   -- cargo, entidad, período
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS is_pep_related  BOOLEAN; -- familiar/asociado de un PEP

-- 7. Información bancaria
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_name               TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_account_type       TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_account_number     TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_account_holder     TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_holder_doc_type    TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_holder_doc_number  TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_country            TEXT;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS bank_currency           TEXT;

-- 9. Declaraciones
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS decl_truthful_info    BOOLEAN;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS decl_lawful_funds     BOOLEAN;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS decl_data_processing  BOOLEAN;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS decl_privacy_policy   BOOLEAN;
ALTER TABLE onboarding_pn ADD COLUMN IF NOT EXISTS decl_screening_consent BOOLEAN;
-- Nota: terms_accepted ya existía y cubre "¿Acepta los Términos y Condiciones?".


-- ============================================================================
-- 2) onboarding_emp — KYB Persona Jurídica
-- ============================================================================

-- 1. Información general de la empresa
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS commercial_name       TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS business_description  TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS incorporation_country TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS address               TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS postal_code           TEXT;

-- 2. Información tributaria
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS tax_regime             TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS is_vat_responsible     BOOLEAN;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS is_gran_contribuyente  BOOLEAN;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS is_autorretenedor      BOOLEAN;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS tax_residence_country  TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS tax_countries          TEXT;  -- lista separada por comas

-- 3. Representante legal — se separa el nombre completo en partes
-- (mejora también el registro en Bepay, que hoy parte rl_full_name por espacios)
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_first_name     TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_middle_name    TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_first_surname  TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_middle_surname TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_nationality    TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_birth_country  TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_sex            TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_address        TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_position       TEXT;   -- cargo
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS rl_profession     TEXT;
-- Nota: rl_full_name se mantiene (compatibilidad); el form nuevo llenará
-- ambos: los campos separados Y rl_full_name concatenado.

-- 5. Información financiera (anual para empresas)
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS annual_income_range   TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS assets_range          TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS liabilities_range     TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS net_worth_range       TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS monthly_volume_range  TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS monthly_tx_count_range TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS avg_tx_value_range    TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS max_tx_value_range    TEXT;

-- 6. Información bancaria
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS bank_name           TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS bank_account_type   TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS bank_country        TEXT;

-- 8. Declaraciones
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS decl_truthful_info     BOOLEAN;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS decl_lawful_funds      BOOLEAN;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS decl_data_processing   BOOLEAN;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS decl_privacy_policy    BOOLEAN;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS decl_screening_consent BOOLEAN;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS decl_sarlaft_compliance BOOLEAN;


-- ============================================================================
-- 3) onboarding_emp_ubo — Accionistas / Beneficiarios finales (sección 4, KYB)
-- ============================================================================
-- Relación uno-a-muchos: una empresa puede tener varios beneficiarios finales.
CREATE TABLE IF NOT EXISTS onboarding_emp_ubo (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_emp_id UUID NOT NULL REFERENCES onboarding_emp(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  doc_type          TEXT,
  doc_number        TEXT,
  nationality       TEXT,
  residence_country TEXT,
  ownership_pct     NUMERIC(5,2),   -- ej. 33.50 (%)
  is_pep            BOOLEAN,
  funds_origin      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_emp_ubo_emp_id ON onboarding_emp_ubo(onboarding_emp_id);

-- RLS: el dueño de la empresa (via onboarding_emp.user_id) y los admins pueden ver/editar sus UBOs.
ALTER TABLE onboarding_emp_ubo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own UBOs" ON onboarding_emp_ubo;
CREATE POLICY "Users manage own UBOs" ON onboarding_emp_ubo
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM onboarding_emp oe
      WHERE oe.id = onboarding_emp_ubo.onboarding_emp_id
        AND oe.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM onboarding_emp oe
      WHERE oe.id = onboarding_emp_ubo.onboarding_emp_id
        AND oe.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
