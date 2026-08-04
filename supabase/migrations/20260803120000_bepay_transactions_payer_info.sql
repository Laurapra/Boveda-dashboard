-- Guarda quién pagó un cobro (nombre y documento) — Bepay ya manda estos
-- datos en el webhook de cobros (payer_name / payer_document) pero antes
-- solo se registraban en audit_log, sin quedar en una columna consultable
-- ni mostrarse en la interfaz.
ALTER TABLE bepay_transactions ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE bepay_transactions ADD COLUMN IF NOT EXISTS payer_document TEXT;
