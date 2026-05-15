import { db } from "../server/db";
import { insertAuditEvent } from "../server/audit-log";

export async function closeFinancialClosing(
  closingId: string,
  tenantId: string,
  actorUserId: string,
  request?: Request
): Promise<{ closed_at: string; already?: boolean } | { error: string }> {
  const { data: row, error: loadErr } = await db
    .from("financial_closings")
    .select("id, status, period_start, period_end, entity_type, entity_id")
    .eq("id", closingId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadErr || !row) return { error: "CLOSING_NOT_FOUND" };
  if (row.status === "closed") return { closed_at: "", already: true };
  if (row.status !== "draft" && row.status !== "reopened") {
    return { error: `INVALID_STATUS:${row.status}` };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await db
    .from("financial_closings")
    .update({
      status: "closed",
      closed_at: now,
      closed_by: actorUserId
    })
    .eq("id", closingId)
    .eq("tenant_id", tenantId);

  if (upErr) return { error: upErr.message };

  await insertAuditEvent({
    tenantId,
    actorUserId,
    action: "finance.closing_closed",
    entityType: "financial_closing",
    entityId: closingId,
    metadata: {
      period_start: row.period_start,
      period_end: row.period_end,
      entity_type: row.entity_type,
      entity_id: row.entity_id
    },
    request
  });

  return { closed_at: now };
}
