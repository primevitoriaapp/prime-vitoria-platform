import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { closeFinancialClosing } from "@/lib/finance/close-closing";
import { enqueueReceivablesForClientInPeriod } from "@/lib/finance/enqueue-period-erp";
import type { Provider } from "@/lib/integrations/types";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  enqueue_erp: z.boolean().optional(),
  erp_provider: z.enum(["omie", "conta_azul"]).optional()
});

/** Fecha todos os rascunhos/reabertos do período; opcionalmente enfileira sync ERP dos clientes. */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const body = bodySchema.parse(await request.json());

    if (body.period_end < body.period_start) {
      return fail("INVALID_PERIOD", "period_end deve ser >= period_start", 400);
    }

    if (body.enqueue_erp && !body.erp_provider) {
      return fail("ERP_PROVIDER_REQUIRED", "Defina erp_provider ao usar enqueue_erp", 400);
    }

    const { data: rows, error: listErr } = await db
      .from("financial_closings")
      .select("id, entity_type, entity_id, status")
      .eq("tenant_id", tenantId)
      .eq("period_start", body.period_start)
      .eq("period_end", body.period_end)
      .in("status", ["draft", "reopened"]);

    if (listErr) return fail("CLOSINGS_LIST_FAILED", listErr.message, 500);

    let closed = 0;
    let skipped = 0;
    let erp_enqueued = 0;
    let erp_deduplicated = 0;
    const clientIds = new Set<string>();

    for (const row of rows ?? []) {
      const result = await closeFinancialClosing(row.id, tenantId, session.userId, request);
      if ("error" in result) {
        if (result.error === "CLOSING_NOT_FOUND") continue;
        skipped += 1;
        continue;
      }
      if (result.already) {
        skipped += 1;
        continue;
      }
      closed += 1;
      if (row.entity_type === "client") {
        clientIds.add(row.entity_id);
      }
    }

    if (body.enqueue_erp && body.erp_provider) {
      assertCapability(session, "erp.jobs.enqueue");
      const provider = body.erp_provider as Provider;
      for (const clientId of clientIds) {
        const r = await enqueueReceivablesForClientInPeriod(
          tenantId,
          clientId,
          body.period_start,
          body.period_end,
          provider,
          session.userId
        );
        erp_enqueued += r.enqueued;
        erp_deduplicated += r.deduplicated;
      }
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.closings_close_all",
      entityType: "financial_closing",
      entityId: tenantId,
      metadata: {
        period_start: body.period_start,
        period_end: body.period_end,
        closed,
        skipped,
        erp_enqueued,
        enqueue_erp: Boolean(body.enqueue_erp)
      },
      request
    });

    return ok({
      period_start: body.period_start,
      period_end: body.period_end,
      closed,
      skipped,
      erp_enqueued,
      erp_deduplicated
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) {
      return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    }
    return mapApiError(error);
  }
}
