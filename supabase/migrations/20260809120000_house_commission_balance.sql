-- ============================================================================
-- Comisión variable de las dispersiones -> saldo de la cuenta admin ("casa").
--
-- Cada dispersión ya le cobra al cliente una comisión fija + una variable
-- (tarifa_variable, % del monto). La fija es lo que Bepay cobra por mover la
-- plata; la variable es nuestro margen. Hasta ahora esa variable se
-- descontaba del cliente pero no quedaba acreditada en ningún lado — no
-- había forma de saber cuánto se había "ganado" para poder retirarlo
-- después.
--
-- De ahora en adelante: al crear una dispersión que Bepay deja en curso
-- (PENDING), se acredita la comisión variable al saldo de la cuenta admin
-- ("casa"). Si esa dispersión termina RECHAZADA, se reintegra el total al
-- cliente (esto ya existía) y ADEMÁS se revierte esa comisión del saldo del
-- admin — al final no se cobró nada real, así que tampoco debe quedar
-- registrada como ganada.
--
-- adjust_balance es una función nueva, deliberadamente SIN el piso de
-- "balance >= amount" que sí tiene debit_balance_if_sufficient. Esa otra
-- función sigue siendo la ÚNICA forma de descontarle saldo a un CLIENTE por
-- una dispersión real — nunca debe poder dejarlo en negativo.
-- adjust_balance es solo para este ajuste contable de la comisión del admin,
-- que si acaso puede quedar momentáneamente en negativo (ej. si el admin ya
-- retiró la comisión antes de que la dispersión se rechazara) — es una
-- corrección de libros internos, no un movimiento de plata real hacia
-- afuera.
-- ============================================================================

CREATE OR REPLACE FUNCTION adjust_balance(p_user_id uuid, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE profiles
  SET balance = balance + p_delta
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  RETURN v_new_balance; -- NULL si no existía la fila
END;
$$;

REVOKE ALL ON FUNCTION adjust_balance(uuid, numeric) FROM PUBLIC;
