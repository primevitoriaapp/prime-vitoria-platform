import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { loadPayableForTenant } from "@/lib/finance/payable-scope";
import { financialMarkPaidBodySchema, financialPaidAt } from "@/lib/finance/mark-paid";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";

/** Marca conta a pagar (motorista) como paga. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.write");
    const tenantId = assertTenantScope(session);
    const { id: payableId } = await params;
    const body = financialMarkPaidBodySchema.parse(await request.json());

    const scoped = await loadPayableForTenant(payableId, tenantId);
    if ("error" in scoped) {
      if (scoped.error === "NOT_FOUND") return fail("PAYABLE_NOT_FOUND", "Título não encontrado", 404);
      return fail("FORBIDDEN", "Título fora do tenant", 403);
    }
    const { row } = scoped;

    if (row.status === "cancelled") return fail("PAYABLE_CANCELLED", "Título cancelado", 409);
    if (row.status === "paid") {
      return ok({ id: payableId, status: "paid", already: true });
    }

    const paidAt = financialPaidAt(body);
    const { error: upErr } = await db
      .from("driver_payables")
      .update({
        status: "paid",
        paid_at: paidAt,
        payment_method: body.payment_method,
        batch_id: body.reference ?? null
      })
      .eq("id", payableId);

    if (upErr) return fail("PAYABLE_UPDATE_FAILED", upErr.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "finance.driver_payable_paid",
      entityType: "driver_payable",
      entityId: payableId,
      metadata: {
        trip_id: row.trip_id,
        amount: row.amount,
        payment_method: body.payment_method
      },
      request
    });

    return ok({ id: payableId, status: "paid", paid_at: paidAt });
  } catch (error) {
    return mapApiError(error);
  }
}
