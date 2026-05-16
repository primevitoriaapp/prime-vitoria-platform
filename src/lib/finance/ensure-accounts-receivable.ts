import { db } from "@/lib/server/db";

/** Cria conta a receber a partir de `trip_financials.amount_client` se a viagem está concluída e ainda não existe título. */
export async function ensureAccountsReceivableFromTripFinancials(
  tripId: string,
  tenantId: string
): Promise<{ created: boolean; receivable_id?: string }> {
  const { data: trip } = await db
    .from("trips")
    .select("client_id, operational_status")
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!trip?.client_id || trip.operational_status !== "completed") {
    return { created: false };
  }

  const { data: existing } = await db.from("accounts_receivable").select("id").eq("trip_id", tripId).maybeSingle();

  if (existing?.id) return { created: false, receivable_id: existing.id };

  const { data: tf } = await db
    .from("trip_financials")
    .select("amount_client")
    .eq("trip_id", tripId)
    .maybeSingle();

  const amount = tf?.amount_client != null ? Number(tf.amount_client) : null;
  if (amount == null || amount <= 0) return { created: false };

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const issueDate = new Date().toISOString().slice(0, 10);

  const { data: inserted, error } = await db
    .from("accounts_receivable")
    .insert({
      trip_id: tripId,
      tenant_id: tenantId,
      client_id: trip.client_id,
      amount,
      issue_date: issueDate,
      due_date: dueDate.toISOString().slice(0, 10),
      status: "open"
    })
    .select("id")
    .single();

  if (error || !inserted) return { created: false };

  return { created: true, receivable_id: inserted.id as string };
}
