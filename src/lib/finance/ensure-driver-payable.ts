import { db } from "@/lib/server/db";
import { driverPayableDueDate } from "@/lib/finance/driver-payable-forecast";

/** Cria pagável ao motorista a partir de `trip_financials` se a viagem foi concluída e ainda não existe título. */
export async function ensureDriverPayableFromTripFinancials(
  tripId: string,
  tenantId: string
): Promise<{ created: boolean; payable_id?: string }> {
  const { data: trip } = await db
    .from("trips")
    .select("driver_id, operational_status")
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!trip?.driver_id || trip.operational_status !== "completed") {
    return { created: false };
  }

  const { data: existing } = await db
    .from("driver_payables")
    .select("id")
    .eq("trip_id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing?.id) return { created: false, payable_id: existing.id };

  const { data: tf } = await db
    .from("trip_financials")
    .select("amount_driver")
    .eq("trip_id", tripId)
    .maybeSingle();

  const amount = tf?.amount_driver != null ? Number(tf.amount_driver) : null;
  if (amount == null || amount <= 0) return { created: false };

  const { data: inserted, error } = await db
    .from("driver_payables")
    .insert({
      trip_id: tripId,
      tenant_id: tenantId,
      driver_id: trip.driver_id,
      amount,
      due_date: driverPayableDueDate(),
      status: "open"
    })
    .select("id")
    .single();

  if (error || !inserted) return { created: false };

  return { created: true, payable_id: inserted.id as string };
}
