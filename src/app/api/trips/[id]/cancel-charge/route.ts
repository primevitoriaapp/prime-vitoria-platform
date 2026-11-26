import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { ensureAccountsReceivableFromTripFinancials } from "@/lib/finance/ensure-accounts-receivable";
import { ensureDriverPayableFromTripFinancials } from "@/lib/finance/ensure-driver-payable";

const r2 = (n: number) => Math.round(n * 100) / 100;
const schema = z.object({
  charge: z.boolean(),
  reason: z.enum(["no_show", "cancelamento_tardio", "outro"]).optional(),
  client_amount: z.coerce.number().min(0).max(500000).optional(),
  driver_amount: z.coerce.number().min(0).max(500000).optional()
});

/**
 * Corrida cancelada ou no-show: cobrar mesmo assim (taxa de no-show / cancelamento em cima da hora).
 * Ela passa a entrar no fechamento como um serviço normal, com o motivo na fatura.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "financeiro", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = schema.parse(await request.json());
    const { data: t } = await db
      .from("trips")
      .select("id, operational_status, client_invoice_id, client_amount, driver_amount, driver_id, charge_after_cancel")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!t) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (!["cancelled", "no_show"].includes(String(t.operational_status))) return fail("NOT_CANCELLED", "Só para corrida cancelada ou no-show.", 409);
    if (t.client_invoice_id) return fail("TRIP_INVOICED", "Esta corrida já está numa fatura. Reabra a fatura antes.", 409);

    if (!b.charge) {
      await db.from("trips").update({ charge_after_cancel: false, charge_reason: null }).eq("id", id);
      await db.from("accounts_receivable").delete().eq("trip_id", id).eq("tenant_id", tenantId).neq("status", "paid");
      await db.from("driver_payables").delete().eq("trip_id", id).eq("tenant_id", tenantId).in("status", ["pending", "open", "scheduled"]);
      await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "trip.cancel_charge_off", entityType: "trip", entityId: id, metadata: {}, request });
      return ok({ charge: false });
    }

    if (!b.reason) return fail("REASON_REQUIRED", "Escolha o motivo da cobrança", 400);
    const client = r2(b.client_amount ?? Number(t.client_amount ?? 0));
    if (!(client > 0)) return fail("INVALID_AMOUNT", "Informe quanto cobrar do cliente", 400);
    const driver = t.driver_id ? r2(b.driver_amount ?? 0) : 0;
    const { error } = await db
      .from("trips")
      .update({
        charge_after_cancel: true,
        charge_reason: b.reason,
        client_amount: client,
        driver_amount: driver,
        margin: r2(client - driver),
        // Cobrança decidida pela central = já conferida (vai direto para "A fechar").
        reviewed_at: new Date().toISOString(),
        review_required: false
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    await db.from("trip_financials").upsert({ trip_id: id, amount_client: client, amount_driver: driver, net_margin: r2(client - driver) }, { onConflict: "trip_id" });
    await db.from("accounts_receivable").update({ amount: client }).eq("trip_id", id).eq("tenant_id", tenantId).neq("status", "paid");
    await ensureAccountsReceivableFromTripFinancials(id, tenantId).catch(() => undefined);
    if (driver > 0) {
      await db.from("driver_payables").update({ amount: driver }).eq("trip_id", id).eq("tenant_id", tenantId).neq("status", "paid");
      await ensureDriverPayableFromTripFinancials(id, tenantId).catch(() => undefined);
    }
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.cancel_charge_on",
      entityType: "trip",
      entityId: id,
      metadata: { motivo: b.reason, cliente: client, motorista: driver, status: t.operational_status },
      request
    });
    return ok({ charge: true, client_amount: client, driver_amount: driver });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", e.issues[0]?.message ?? "Dados inválidos", 400);
    return mapApiError(e);
  }
}
