-- Evita filas duplicadas para la misma transacción de Bepay (bepay_ide).
-- Sin esto, dos entregas casi simultáneas del mismo webhook (Bepay reintenta
-- si no recibe una respuesta 2xx a tiempo) podían insertar dos filas para el
-- mismo recaudo, y cada una abonaba el saldo del cliente por separado —
-- inflando su saldo por encima de lo que realmente recibió.
--
-- IMPORTANTE: correr primero el diagnóstico de abajo. Si ya existen
-- duplicados, este ALTER TABLE fallará (Postgres no deja crear una
-- restricción UNIQUE si hay filas que la violan) — en ese caso hay que
-- resolver los duplicados a mano antes de aplicar esta migración.
--
-- Diagnóstico (correr antes, de solo lectura):
--   SELECT bepay_ide, type, COUNT(*), array_agg(id) AS ids, array_agg(amount) AS amounts
--   FROM bepay_transactions
--   WHERE bepay_ide IS NOT NULL
--   GROUP BY bepay_ide, type
--   HAVING COUNT(*) > 1;

ALTER TABLE bepay_transactions
  ADD CONSTRAINT bepay_transactions_ide_type_unique UNIQUE (bepay_ide, type);
