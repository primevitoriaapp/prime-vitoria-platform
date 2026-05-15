import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "../server/db";

export type PayableRow = {
  id: string;
  trip_id: string;
  driver_id: string;
  amount: number;
  status: string;
  tenant_id?: string;
};

export async function loadPayableForTenant(
  payableId: string,
  tenantId: string,
  client: SupabaseClient = db
): Promise<{ row: PayableRow } | { error: "NOT_FOUND" } | { error: "FORBIDDEN" }> {
  const { data: row, error: loadErr } = await client
    .from("driver_payables")
    .select("id, trip_id, driver_id, amount, status, tenant_id")
    .eq("id", payableId)
    .maybeSingle();

  if (loadErr || !row) return { error: "NOT_FOUND" };

  if (row.tenant_id) {
    if (row.tenant_id !== tenantId) return { error: "FORBIDDEN" };
    return { row: row as PayableRow };
  }

  const { data: trip } = await client.from("trips").select("tenant_id").eq("id", row.trip_id).maybeSingle();
  if (!trip || trip.tenant_id !== tenantId) return { error: "FORBIDDEN" };
  return { row: row as PayableRow };
}
