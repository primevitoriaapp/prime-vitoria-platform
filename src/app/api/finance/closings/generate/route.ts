import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { aggregateClosingsForPeriod, upsertDraftClosings } from "@/lib/finance/generate-closings";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

/** Gera rascunhos de fechamento mensal a partir de `trip_financials` no período. */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const body = bodySchema.parse(await request.json());

    if (body.period_end < body.period_start) {
      return fail("INVALID_PERIOD", "period_end deve ser >= period_start", 400);
    }

    const aggregates = await aggregateClosingsForPeriod(tenantId, body.period_start, body.period_end);
    const { written, skipped } = await upsertDraftClosings(
      tenantId,
      body.period_start,
      body.period_end,
      aggregates
    );

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.closings_generated",
      entityType: "financial_closing",
      entityId: tenantId,
      metadata: {
        period_start: body.period_start,
        period_end: body.period_end,
        entities: written,
        skipped_closed: skipped
      },
      request
    });

    return ok({
      period_start: body.period_start,
      period_end: body.period_end,
      entities: written,
      skipped_closed: skipped,
      aggregates: aggregates.length
    });
  } catch (error) {
    return mapApiError(error);
  }
}
