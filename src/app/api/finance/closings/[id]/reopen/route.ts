import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({ reason: z.string().max(500).optional() });

/** Reabre fechamento (`closed` → `reopened`) para correção. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const { data: row, error: loadErr } = await db
      .from("financial_closings")
      .select("id, status, period_start, period_end, entity_type, entity_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (loadErr || !row) return fail("CLOSING_NOT_FOUND", "Fechamento não encontrado", 404);
    if (row.status === "reopened") return ok({ id, status: "reopened", already: true });
    if (row.status === "draft") return fail("CLOSING_IS_DRAFT", "Fechamento ainda é rascunho", 409);
    if (row.status !== "closed") return fail("INVALID_STATUS", `Estado: ${row.status}`, 409);

    const { error: upErr } = await db
      .from("financial_closings")
      .update({
        status: "reopened",
        closed_at: null,
        closed_by: null
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (upErr) return fail("CLOSING_UPDATE_FAILED", upErr.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.closing_reopened",
      entityType: "financial_closing",
      entityId: id,
      metadata: { reason: body.reason ?? null, period_start: row.period_start, period_end: row.period_end },
      request
    });

    return ok({ id, status: "reopened" });
  } catch (error) {
    return mapApiError(error);
  }
}
