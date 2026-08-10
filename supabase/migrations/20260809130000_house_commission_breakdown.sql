-- ============================================================================
-- Desglose de la comisión de la casa: confirmada (de dispersiones ya
-- APPROVED/COMPLETED, no se revierte) vs congelada (de dispersiones
-- todavía PENDING — se acreditó al crearlas, pero se revertiría si terminan
-- rechazadas). Mismo concepto que "Congelado en dispersiones pendientes"
-- que ya existe para el saldo del cliente en Inicio, aplicado ahora a la
-- comisión de la casa, y desglosado también por cliente.
--
-- La comisión variable de cada dispersión no se guarda en una columna
-- aparte — se deriva restando comision_total - tarifa_aplicada (tarifa_aplicada
-- guarda la comisión FIJA; ver bepay-payouts/index.ts, donde se arman
-- exactamente así).
--
-- confirmada + congelada de todos los clientes sumadas debe dar el mismo
-- número que profiles.balance de la cuenta admin (ver adjust_balance /
-- creditHouseCommission) — porque esa es justo la regla: se acredita al
-- crear (PENDING) y se revierte solo si se rechaza, nunca al completarse.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_house_commission_status()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  comision_confirmada bigint,
  comision_congelada bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if (select role from profiles where id = auth.uid()) != 'admin' then
    raise exception 'No autorizado';
  end if;

  return query
    select
      p.id,
      p.full_name,
      p.email,
      coalesce(sum(
        case when t.type = 'payout' and t.status in ('APPROVED', 'COMPLETED')
          then coalesce(t.comision_total, 0) - coalesce(t.tarifa_aplicada, 0)
          else 0
        end
      ), 0)::bigint as comision_confirmada,
      coalesce(sum(
        case when t.type = 'payout' and t.status = 'PENDING'
          then coalesce(t.comision_total, 0) - coalesce(t.tarifa_aplicada, 0)
          else 0
        end
      ), 0)::bigint as comision_congelada
    from profiles p
    left join bepay_transactions t on t.user_id = p.id
    group by p.id, p.full_name, p.email
    having coalesce(sum(
      case when t.type = 'payout' and t.status in ('APPROVED', 'COMPLETED', 'PENDING')
        then coalesce(t.comision_total, 0) - coalesce(t.tarifa_aplicada, 0)
        else 0
      end
    ), 0) > 0
    order by comision_congelada desc, comision_confirmada desc;
end;
$$;
