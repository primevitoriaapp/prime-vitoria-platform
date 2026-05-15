import { db } from "../server/db";
import { isPostgresUniqueViolation } from "../server/postgres-errors";
import type { Provider } from "../integrations/types";

/** Enfileira sync ERP de titulos a receber do cliente no período (apos fechamento). */
export async function enqueueReceivablesForClientInPeriod(
  tenantId: string,
  clientId: string,
  periodStart: string,
  periodEnd: string,
  provider: Provider,
  requestedBy: string
): Promise<{ enqueued: number; deduplicated: number }> {
  const endIso = periodEnd.length === 10 ? `${periodEnd}T23:59:59.999Z` : periodEnd;

  const { data: trips, error: tripErr } = await db
    .from("trips")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .gte("scheduled_at", periodStart)
    .lte("scheduled_at", endIso);

  if (tripErr) throw new Error(tripErr.message);
  const tripIds = (trips ?? []).map((t) => t.id as string);
  if (tripIds.length === 0) return { enqueued: 0, deduplicated: 0 };

  const { data: receivables, error: arErr } = await db
    .from("accounts_receivable")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("trip_id", tripIds)
    .in("status", ["open", "paid"]);

  if (arErr) throw new Error(arErr.message);

  let enqueued = 0;
  let deduplicated = 0;

  for (const ar of receivables ?? []) {
    const receivableId = ar.id as string;
    const { error: insErr } = await db.from("erp_sync_jobs").insert({
      tenant_id: tenantId,
      provider,
      direction: "outbound",
      entity_type: "receivable",
      entity_id: receivableId,
      status: "queued",
      payload_snapshot: {
        source: "finance.closing_close",
        client_id: clientId,
        period_start: periodStart,
        period_end: periodEnd,
        requested_by: requestedBy
      }
    });

    if (!insErr) {
      enqueued += 1;
      continue;
    }
    if (isPostgresUniqueViolation(insErr)) {
      deduplicated += 1;
      continue;
    }
    throw new Error(insErr.message);
  }

  return { enqueued, deduplicated };
}
