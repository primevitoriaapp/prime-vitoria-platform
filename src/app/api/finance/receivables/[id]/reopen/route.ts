import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { loadReceivableForTenant } from "@/lib/finance/receivable-scope";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({
  reason: z.string().max(500).optional()
});

/** Reverte baixa manual: `paid` → `open`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id: receivableId } = await params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const scoped = await loadReceivableForTenant(receivableId, tenantId);
    if ("error" in scoped) {
      if (scoped.error === "NOT_FOUND") return fail("RECEIVABLE_NOT_FOUND", "Título não encontrado", 404);
      return fail("FORBIDDEN", "Título fora do tenant", 403);
    }

    const { row } = scoped;
    if (row.status === "open") {
      return ok({ id: receivableId, status: "open", already: true });
    }
    if (row.status === "cancelled") {
      return fail("RECEIVABLE_CANCELLED", "Título cancelado; não é possível reabrir baixa", 409);
    }
    if (row.status !== "paid") {
      return fail("INVALID_STATUS", `Estado atual: ${row.status}`, 409);
    }

    const { error: upErr } = await db
      .from("accounts_receivable")
      .update({
        status: "open",
        paid_at: null,
        payment_method: null,
        reference: null
      })
      .eq("id", receivableId);

    if (upErr) return fail("RECEIVABLE_UPDATE_FAILED", upErr.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.receivable_reopened",
      entityType: "accounts_receivable",
      entityId: receivableId,
      metadata: { trip_id: row.trip_id, reason: body.reason ?? null },
      request
    });

    return ok({ id: receivableId, status: "open" });
  } catch (error) {
    return mapApiError(error);
  }
}
