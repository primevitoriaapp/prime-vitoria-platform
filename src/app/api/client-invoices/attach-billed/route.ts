import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

const schema = z.object({ trip_id: z.string().uuid(), invoice_id: z.string().uuid() });

/**
 * Corrida que já foi cobrada dentro de outra fatura (ex.: volta incluída na diária do voucher).
 * Liga a corrida à fatura com valor ao cliente R$ 0 (o total da fatura não muda) e tira o "a receber" dela.
 * O valor do motorista continua o mesmo — ele trabalhou e recebe.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Só admin ou financeiro", 403);
    const tenantId = assertTenantScope(session);
    const { trip_id, invoice_id } = schema.parse(await request.json());
    const [{ data: trip }, { data: inv }] = await Promise.all([
      db.from("trips").select("id, client_id, client_amount, driver_amount, client_invoice_id").eq("id", trip_id).eq("tenant_id", tenantId).maybeSingle(),
      db.from("client_invoices").select("id, client_id, number, status").eq("id", invoice_id).eq("tenant_id", tenantId).maybeSingle()
    ]);
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (!inv) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);
    if (trip.client_invoice_id) return fail("ALREADY_INVOICED", "Esta corrida já está em uma fatura.", 409);
    if (inv.client_id !== trip.client_id) return fail("WRONG_CLIENT", "A fatura é de outro cliente.", 409);
    if (inv.status === "cancelada") return fail("INVOICE_CANCELLED", "Fatura cancelada.", 409);
    const driver = trip.driver_amount == null ? null : Number(trip.driver_amount);
    const { error } = await db
      .from("trips")
      .update({ client_invoice_id: inv.id, client_amount: 0, margin: driver == null ? 0 : -driver })
      .eq("id", trip_id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    await db.from("accounts_receivable").delete().eq("trip_id", trip_id).eq("tenant_id", tenantId).neq("status", "paid");
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.attached_to_invoice",
      entityType: "trip",
      entityId: trip_id,
      metadata: { fatura: inv.number, valor_cliente_antes: trip.client_amount, motivo: "já cobrada dentro da fatura" },
      request
    });
    return ok({ invoice_number: inv.number });
  } catch (e) {
    return mapApiError(e);
  }
}
