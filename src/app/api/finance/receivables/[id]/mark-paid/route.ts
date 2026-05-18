import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { loadReceivableForTenant } from "@/lib/finance/receivable-scope";
import { financialMarkPaidBodySchema, financialPaidAt } from "@/lib/finance/mark-paid";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

/** Marca título a receber como pago (baixa manual no financeiro). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id: receivableId } = await params;
    const body = financialMarkPaidBodySchema.parse(await request.json());

    const scoped = await loadReceivableForTenant(receivableId, tenantId);
    if ("error" in scoped) {
      if (scoped.error === "NOT_FOUND") return fail("RECEIVABLE_NOT_FOUND", "Título não encontrado", 404);
      return fail("FORBIDDEN", "Título fora do tenant", 403);
    }
    const { row } = scoped;

    if (row.status === "cancelled") {
      return fail("RECEIVABLE_CANCELLED", "Título cancelado", 409);
    }
    if (row.status === "paid") {
      return ok({ id: receivableId, status: "paid", already: true });
    }

    const paidAt = financialPaidAt(body);
    const { error: upErr } = await db
      .from("accounts_receivable")
      .update({
        status: "paid",
        paid_at: paidAt,
        payment_method: body.payment_method,
        reference: body.reference ?? null
      })
      .eq("id", receivableId);

    if (upErr) return fail("RECEIVABLE_UPDATE_FAILED", upErr.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.receivable_paid",
      entityType: "accounts_receivable",
      entityId: receivableId,
      metadata: {
        trip_id: row.trip_id,
        amount: row.amount,
        payment_method: body.payment_method
      },
      request
    });

    return ok({ id: receivableId, status: "paid", paid_at: paidAt });
  } catch (error) {
    return mapApiError(error);
  }
}
