import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve o tenant da corrida associada a um titulo a receber (escopo ERP).
 */
export async function getReceivableTripTenantId(
  db: SupabaseClient,
  receivableId: string
): Promise<string | null> {
  const { data: receivable, error: arErr } = await db
    .from("accounts_receivable")
    .select("trip_id")
    .eq("id", receivableId)
    .maybeSingle();

  if (arErr || !receivable?.trip_id) return null;

  const { data: trip, error: tripErr } = await db
    .from("trips")
    .select("tenant_id")
    .eq("id", receivable.trip_id)
    .maybeSingle();

  if (tripErr || !trip?.tenant_id) return null;
  return trip.tenant_id as string;
}
