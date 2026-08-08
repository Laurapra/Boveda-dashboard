-- ============================================================================
-- Saldo (balance) del cliente — necesario para la nueva lógica de dispersión:
--   1. Un recaudo aprobado (charge) abona al saldo el neto (monto - comisión).
--      Ej: recauda $10.000, comisión $1.190 -> se abonan $8.810 al saldo.
--   2. Una dispersión (payout) que queda PENDING descuenta del saldo el total
--      a debitar (monto + comisión) de inmediato.
--   3. Si esa dispersión termina en un estado de RECHAZO/FALLO, se reintegra
--      ese mismo total. Si termina COMPLETADA, no se toca el saldo de nuevo
--      — ya se descontó al quedar pendiente.
--   4. Antes de intentar una dispersión, si el saldo no alcanza para el total
--      a debitar, la operación se bloquea con "Fondos insuficientes" y ni
--      siquiera se envía a Bepay.
--
-- El saldo vive en profiles.balance. Los ajustes se hacen SIEMPRE a través de
-- las funciones de abajo (nunca con un UPDATE directo desde una Edge
-- Function), porque son atómicas a nivel de fila: el "WHERE balance >=
-- p_amount" en debit_balance_if_sufficient hace que, aunque dos dispersiones
-- del mismo usuario lleguen al mismo tiempo, Postgres serialice los UPDATEs
-- sobre esa fila y ninguna pueda dejar el saldo en negativo por una
-- condición de carrera (no es un simple "leer saldo, comparar, restar" desde
-- la Edge Function, que sí tendría ese hueco).
--
-- Solo el service role (Edge Functions) debe ejecutarlas — se revoca el
-- EXECUTE por defecto a PUBLIC para que ningún cliente autenticado pueda
-- llamarlas directo vía supabase-js y mover saldo ajeno.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS balance NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION debit_balance_if_sufficient(p_user_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount debe ser positivo';
  END IF;

  UPDATE profiles
  SET balance = balance - p_amount
  WHERE id = p_user_id AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  RETURN v_new_balance; -- NULL si no existía la fila o el saldo no alcanzaba
END;
$$;

CREATE OR REPLACE FUNCTION credit_balance(p_user_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount debe ser positivo';
  END IF;

  UPDATE profiles
  SET balance = balance + p_amount
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION debit_balance_if_sufficient(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION credit_balance(uuid, numeric) FROM PUBLIC;

-- ============================================================================
-- Backfill único: calcula el saldo inicial de cada usuario a partir de su
-- historial YA existente en bepay_transactions. Sin esto, todo el mundo
-- arrancaría en $0 y quedaría bloqueado para dispersar aunque ya tenga
-- fondos reales recaudados antes de este cambio.
--
-- Usa la misma regla de negocio que aplica de ahora en adelante:
--   - Recaudos aprobados (APPROVED/COMPLETED) abonan el neto (monto - comisión).
--   - Dispersiones que NO terminaron en un estado de rechazo/fallo (incluye
--     las que quedaron PENDING) restan el total (monto + comisión) — ya que,
--     en la práctica, ese dinero ya salió o está en proceso de salir.
--   - Se usa GREATEST(0, ...) como red de seguridad: si el historial tiene
--     alguna inconsistencia (estados mal registrados de pruebas viejas, por
--     ejemplo) que diera un neto negativo, el saldo arranca en 0 en vez de
--     en negativo. Un admin puede ajustar manualmente si hiciera falta.
--
-- Esto corre UNA sola vez, aquí, en esta migración. De aquí en adelante el
-- saldo es la fuente de verdad — no se vuelve a recalcular desde el
-- historial de transacciones.
-- ============================================================================
UPDATE profiles p
SET balance = GREATEST(0, COALESCE(agg.neto, 0))
FROM (
  SELECT
    user_id,
    SUM(
      CASE WHEN type = 'charge' AND status IN ('APPROVED', 'COMPLETED')
        THEN amount - COALESCE(comision_total, 0)
        ELSE 0
      END
    )
    -
    SUM(
      CASE WHEN type = 'payout'
        AND UPPER(status) NOT LIKE '%REJECT%' AND UPPER(status) NOT LIKE '%FAIL%'
        AND UPPER(status) NOT LIKE '%CANCEL%' AND UPPER(status) NOT LIKE '%DENIED%'
        AND UPPER(status) NOT LIKE '%ERROR%'  AND UPPER(status) NOT LIKE '%DECLIN%'
        AND UPPER(status) NOT LIKE '%RECHAZ%'
        THEN amount + COALESCE(comision_total, 0)
        ELSE 0
      END
    ) AS neto
  FROM bepay_transactions
  GROUP BY user_id
) AS agg
WHERE p.id = agg.user_id;
