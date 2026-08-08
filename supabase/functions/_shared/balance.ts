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

// Aplica la transición de estado de una dispersión ya existente (polling
// manual, sync masivo, o webhook) — reintegra el saldo si pasó a un estado
// de rechazo, y no hace nada si pasó a un estado de éxito. Es seguro
// llamarla más de una vez para la misma fila: solo actúa si el estado
// ANTERIOR guardado era PENDING (si ya se procesó el rechazo antes, el
// estado ya no será PENDING la siguiente vez y no se reintegra dos veces).
//
// IMPORTANTE: se debe llamar con el estado ANTERIOR (antes de actualizar la
// fila con el nuevo estado) — el llamador es responsable de leer la fila
// antes de hacer el UPDATE.
export async function applyPayoutStatusTransition(
  adminClient: AdminClient,
  tx: { id: string; user_id: string; status: string; amount: number; comision_total: number | null },
  newStatus: string
): Promise<void> {
  if (!isPendingStatus(tx.status)) return; // ya se resolvió antes, no volver a tocar el saldo
  if (!isRejectedStatus(newStatus)) return; // pasó a un estado de éxito — no hacer nada más

  const total = Number(tx.amount) + Number(tx.comision_total ?? 0);
  await creditBalance(adminClient, tx.user_id, total);

  await adminClient.from("audit_log").insert({
    user_id: tx.user_id,
    action: "PAYOUT_BALANCE_REFUND",
    entity: "bepay_transaction",
    entity_id: tx.id,
    metadata: { total_reintegrado: total, status_anterior: tx.status, status_nuevo: newStatus },
  });
}
