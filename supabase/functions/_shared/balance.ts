// supabase/functions/_shared/balance.ts
//
// Lógica de saldo (balance) del cliente — la usan bepay-payouts (creación y
// polling de dispersiones) y bepay-payout-webhook (notificaciones push de
// Bepay), y bepay-charge-webhook para el abono de recaudos. Vive en un solo
// lugar para que la regla de negocio no se duplique/desincronice entre los
// tres:
//
//   1. Al crear una dispersión que Bepay deja en PENDING (o la resuelve de
//      una en un estado de éxito), se descuenta el "Total a debitar" (monto
//      + comisión) del saldo del cliente — de forma atómica y bloqueando la
//      operación si no alcanza (ver debitBalanceIfSufficient).
//   2. Si luego el estado pasa a un estado terminal de rechazo/fallo, se
//      reintegra ese mismo total (ver applyPayoutStatusTransition).
//   3. Si pasa a un estado terminal de éxito, no se hace nada más — ya se
//      descontó al quedar pendiente.
//   4. Al mismo tiempo que se descuenta el total al cliente (punto 1), se
//      acredita la comisión variable (nuestro margen, no lo que cobra
//      Bepay) al saldo de la cuenta admin/"casa" — ver getHouseAdminId y
//      creditHouseCommission en bepay-payouts. Si la dispersión termina
//      rechazada (punto 2), esa comisión se revierte del saldo de la casa
//      también, porque al final no se cobró nada real.
//
// Los nombres de estado que devuelve Bepay no están 100% documentados para
// todos los casos, así que se clasifican por palabras clave en vez de una
// lista cerrada — un estado nuevo no reconocido cae del lado seguro (no
// reintegra, no lo trata como aprobado).

// deno-lint-ignore no-explicit-any
type AdminClient = any;

const REJECTED_KEYWORDS = ["REJECT", "FAIL", "CANCEL", "DENIED", "ERROR", "DECLIN", "RECHAZ"];

export function isRejectedStatus(status: string): boolean {
  const s = (status ?? "").toUpperCase();
  return REJECTED_KEYWORDS.some((k) => s.includes(k));
}

export function isPendingStatus(status: string): boolean {
  return (status ?? "").toUpperCase() === "PENDING";
}

// Descuenta el total (monto + comisión) del saldo del cliente de forma
// atómica — solo si alcanza el saldo. Devuelve el nuevo saldo, o null si no
// alcanzaba (el llamador debe abortar/bloquear la operación en ese caso, y
// NUNCA llamar a Bepay antes de confirmar que esto no devolvió null).
export async function debitBalanceIfSufficient(
  adminClient: AdminClient,
  userId: string,
  total: number
): Promise<number | null> {
  const { data, error } = await adminClient.rpc("debit_balance_if_sufficient", {
    p_user_id: userId,
    p_amount: total,
  });
  if (error) throw new Error("Error descontando saldo: " + error.message);
  return data === null || data === undefined ? null : Number(data);
}

// Reintegra un monto al saldo del cliente (dispersión rechazada, etc).
export async function creditBalance(
  adminClient: AdminClient,
  userId: string,
  total: number
): Promise<number> {
  const { data, error } = await adminClient.rpc("credit_balance", {
    p_user_id: userId,
    p_amount: total,
  });
  if (error) throw new Error("Error abonando saldo: " + error.message);
  return Number(data);
}

// Ajusta el saldo de una cuenta sumando/restando un delta (puede ser
// negativo), SIN el piso de "balance >= amount" — a diferencia de
// debitBalanceIfSufficient, que es la única forma válida de descontarle
// saldo a un cliente por una dispersión real. Esta función es solo para
// correcciones contables internas (ver getHouseAdminId / el crédito y
// reversión de la comisión variable de la casa) — nunca debe usarse para
// mover plata de un cliente.
export async function adjustBalance(
  adminClient: AdminClient,
  userId: string,
  delta: number
): Promise<number | null> {
  const { data, error } = await adminClient.rpc("adjust_balance", {
    p_user_id: userId,
    p_delta: delta,
  });
  if (error) throw new Error("Error ajustando saldo: " + error.message);
  return data === null || data === undefined ? null : Number(data);
}

// Encuentra la cuenta "casa" (admin) que acumula la comisión variable de las
// dispersiones de todos los clientes, para que después se pueda retirar.
// Hoy existe un solo usuario con role='admin' en el sistema — si en algún
// momento hay más de uno, esto toma el primero que devuelva Postgres (no hay
// todavía un campo que marque cuál es "la" cuenta casa de forma explícita).
export async function getHouseAdminId(adminClient: AdminClient): Promise<string | null> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[getHouseAdminId] Error buscando cuenta admin:", error.message);
    return null;
  }
  return data?.id ?? null;
}

// Aplica la transición de estado de una dispersión ya existente (polling
// manual, sync masivo, o webhook) — reintegra el saldo si pasó a un estado
// de rechazo, y no hace nada de saldo si pasó a un estado de éxito. ESTA
// función es la única que escribe el nuevo status — el llamador ya NO debe
// hacer su propio UPDATE de status después de llamarla (antes cada llamador
// leía el status "de antes", decidía si reintegrar, y LUEGO pisaba el status
// con su propio UPDATE por separado; si el webhook de Bepay y una
// sincronización manual/automática caían casi al mismo tiempo para la misma
// dispersión, las dos podían leer "PENDING" antes de que la otra terminara
// de escribir, y las dos reintegraban el mismo dinero).
//
// Ahora la transición a un estado de rechazo es una sola UPDATE condicional
// y atómica en la base de datos ("WHERE status = 'PENDING'"): como mucho una
// de dos llamadas concurrentes logra afectar la fila (gana la carrera), y
// solo esa reintegra el saldo — la otra no encuentra la fila en PENDING (ya
// la cambió la primera) y no hace nada. Es seguro llamarla cualquier
// cantidad de veces para la misma fila.
export async function applyPayoutStatusTransition(
  adminClient: AdminClient,
  tx: { id: string; user_id: string; amount: number; comision_total: number | null; tarifa_aplicada?: number | null },
  newStatus: string,
  extraFields: Record<string, unknown> = {}
): Promise<void> {
  const baseUpdate = { status: newStatus, updated_at: new Date().toISOString(), ...extraFields };

  if (isRejectedStatus(newStatus)) {
    const { data: rows, error } = await adminClient
      .from("bepay_transactions")
      .update(baseUpdate)
      .eq("id", tx.id)
      .eq("status", "PENDING")
      .select("id");

    if (error) throw new Error("Error actualizando dispersión: " + error.message);
    if (!rows || rows.length === 0) return; // otra llamada ya la transicionó (o ya no estaba PENDING) — no reintegrar de nuevo

    const total = Number(tx.amount) + Number(tx.comision_total ?? 0);
    await creditBalance(adminClient, tx.user_id, total);

    await adminClient.from("audit_log").insert({
      user_id: tx.user_id,
      action: "PAYOUT_BALANCE_REFUND",
      entity: "bepay_transaction",
      entity_id: tx.id,
      metadata: { total_reintegrado: total, status_nuevo: newStatus },
    });

    // ── Revertir la comisión variable que se había acreditado a la casa ──
    // comision_total = comisión fija (tarifa_aplicada) + variable — como al
    // crear la dispersión no se guarda la variable por separado, se deriva
    // restando (ver bepay-payouts, donde se arman igual). Si esta dispersión
    // se creó antes de que existiera este sistema (tarifa_aplicada es null),
    // no hay nada que revertir.
    if (tx.tarifa_aplicada !== undefined && tx.tarifa_aplicada !== null) {
      const comisionVariable = Number(tx.comision_total ?? 0) - Number(tx.tarifa_aplicada);
      if (comisionVariable > 0) {
        const houseId = await getHouseAdminId(adminClient);
        if (houseId) {
          await adjustBalance(adminClient, houseId, -comisionVariable);
          await adminClient.from("audit_log").insert({
            user_id: houseId,
            action: "HOUSE_COMMISSION_REVERSED",
            entity: "bepay_transaction",
            entity_id: tx.id,
            metadata: { comision_variable: comisionVariable, dispersion_user_id: tx.user_id, status_nuevo: newStatus },
          });
        }
      }
    }
    return;
  }

  // Transición a un estado de éxito u otro no-rechazo — no mueve saldo, solo
  // actualiza si sigue en PENDING (sin riesgo de doble movimiento de dinero
  // aquí, pero misma condición para no pisar un estado final ya resuelto).
  await adminClient
    .from("bepay_transactions")
    .update(baseUpdate)
    .eq("id", tx.id)
    .eq("status", "PENDING");
}
