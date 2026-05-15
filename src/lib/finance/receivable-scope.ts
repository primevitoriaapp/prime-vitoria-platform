import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "../server/db";

export type ReceivableRow = {
  id: string;
  trip_id: string;
  client_id: string;
  amount: number;
  status: string;
  tenant_id?: string;
};

/** Carrega titulo e valida tenant via viagem (ou coluna tenant_id quando presente). */
export async function loadReceivableForTenant(
  receivableId: string,
  tenantId: string,
  client: SupabaseClient = db
): Promise<{ row: ReceivableRow } | { error: "NOT_FOUND" } | { error: "FORBIDDEN" }> {
  const { data: row, error: loadErr } = await client
    .from("accounts_receivable")
    .select("id, trip_id, client_id, amount, status, tenant_id")
    .eq("id", receivableId)
    .maybeSingle();

  if (loadErr || !row) return { error: "NOT_FOUND" };

  if (row.tenant_id) {
    if (row.tenant_id !== tenantId) return { error: "FORBIDDEN" };
    return { row: row as ReceivableRow };
  }

  const { data: trip } = await client.from("trips").select("tenant_id").eq("id", row.trip_id).maybeSingle();
  if (!trip || trip.tenant_id !== tenantId) return { error: "FORBIDDEN" };
  return { row: row as ReceivableRow };
}
