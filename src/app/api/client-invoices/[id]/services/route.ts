import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { editInvoiceTripAmounts, listInvoiceTripAmounts } from "@/lib/finance/invoice-trip-edit";

async function guard() {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "financeiro") return { session, denied: fail("FORBIDDEN", "Só admin ou financeiro", 403) };
  return { session, denied: null };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await guard();
    if (denied) return denied;
    const { id } = await params;
    return ok(await listInvoiceTripAmounts(assertTenantScope(session), id));
  } catch (e) {
    return mapApiError(e);
  }
}

const bodySchema = z.object({
  trip_id: z.string().uuid(),
  client_amount: z.coerce.number().min(0).max(500000),
  driver_amount: z.coerce.number().min(0).max(500000).nullable().optional()
});

/** Corrige o valor de uma corrida da fatura e recalcula o total. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await guard();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = bodySchema.parse(await request.json());
    const r = await editInvoiceTripAmounts({ tenantId, invoiceId: id, tripId: b.trip_id, clientAmount: b.client_amount, driverAmount: b.driver_amount ?? null }).catch((e: Error) => e);
    if (r instanceof Error) return fail("EDIT_FAILED", r.message, 409);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "invoice.amount_edit",
      entityType: "client_invoice",
      entityId: id,
      metadata: { trip_id: b.trip_id, before: r.before, after: r.after, total: r.invoice_total },
      request
    });
    return ok(r);
  } catch (e) {
    return mapApiError(e);
  }
}
