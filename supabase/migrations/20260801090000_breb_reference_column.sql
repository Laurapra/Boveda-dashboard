-- ============================================================================
-- Guardar la referencia Bre-b REAL que Bepay aceptó al registrar a cada
-- persona/empresa, en vez de recalcularla cada vez.
-- ============================================================================
-- Causa raíz del problema de "llave no encontrada" / "entrada duplicada":
-- la fórmula para construir la referencia (RAMPLIX+dígitos) cambió varias
-- veces durante las pruebas. Cada vez que cambiaba, "Reintentar Bre-B"
-- intentaba registrar de nuevo a la misma persona con una referencia
-- DISTINTA — y Bepay rechaza reintentos con datos de identificación
-- duplicados (mismo documento) bajo una referencia nueva. Mientras tanto,
-- create_virtual_key recalculaba su propia referencia con la fórmula más
-- reciente, que casi nunca coincidía con la que Bepay realmente aceptó.
--
-- A partir de ahora, la referencia que Bepay aceptó se guarda una sola vez
-- en esta columna, y tanto el reintento de registro como la creación de
-- llaves la reutilizan tal cual — ya no se vuelve a calcular.
-- ============================================================================

ALTER TABLE onboarding_pn  ADD COLUMN IF NOT EXISTS breb_reference TEXT;
ALTER TABLE onboarding_emp ADD COLUMN IF NOT EXISTS breb_reference TEXT;
