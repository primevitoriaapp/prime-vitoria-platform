import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { loadPayableForTenant } from "@/lib/finance/payable-scope";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({ reason: z.string().max(500).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id: payableId } = await params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const scoped = await loadPayableForTenant(payableId, tenantId);
    if ("error" in scoped) {
      if (scoped.error === "NOT_FOUND") return fail("PAYABLE_NOT_FOUND", "Título não encontrado", 404);
      return fail("FORBIDDEN", "Título fora do tenant", 403);
    }
    const { row } = scoped;

    if (row.status === "open") return ok({ id: payableId, status: "open", already: true });
    if (row.status === "cancelled") {
      return fail("PAYABLE_CANCELLED", "Título cancelado", 409);
    }
    if (row.status !== "paid") return fail("INVALID_STATUS", `Estado: ${row.status}`, 409);

    const { error: upErr } = await db
      .from("driver_payables")
      .update({ status: "open", paid_at: null, payment_method: null, batch_id: null })
      .eq("id", payableId);
    if (upErr) return fail("PAYABLE_UPDATE_FAILED", upErr.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.driver_payable_reopened",
      entityType: "driver_payable",
      entityId: payableId,
      metadata: { trip_id: row.trip_id, reason: body.reason ?? null },
      request
    });

    return ok({ id: payableId, status: "open" });
  } catch (error) {
    return mapApiError(error);
  }
}
