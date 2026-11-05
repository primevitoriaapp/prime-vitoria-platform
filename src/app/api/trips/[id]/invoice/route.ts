import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { generateInvoiceForTrip } from "@/lib/finance/client-invoices";
import { clientDueDate, driverPayoutDateFromClientDue, spDay } from "@/lib/finance/payout-schedule";

function staff(role: string) {
  return role === "admin" || role === "financeiro" || role === "operador";
}

/** Fatura desta corrida (ou o vencimento sugerido, se ainda não faturou). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: t } = await db
      .from("trips")
      .select("id, client_id, scheduled_at, operational_status, client_invoice_id, client_voucher_path")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!t) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const { data: c } = await db
      .from("clients")
      .select("invoiced, invoice_closing_day, invoice_per_service, payment_term_days, reconciliation_business_days")
      .eq("id", t.client_id)
      .maybeSingle();
    const terms = c ?? {};
    let invoice = null;
    if (t.client_invoice_id) {
      const { data } = await db
        .from("client_invoices")
        .select("id, number, due_date, status, total_amount, boleto_path, boleto_line, voucher_path, client_ref, period_start, period_end")
        .eq("id", t.client_invoice_id)
        .maybeSingle();
      invoice = data;
    }
    // Sugestão: hoje + prazo do cliente (o boleto é emitido hoje).
    const today = spDay(new Date());
    const term = Number((terms as { payment_term_days?: number | null }).payment_term_days ?? 30) || 30;
    const suggested = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + term)).toISOString().slice(0, 10);
    const due = (invoice?.due_date as string | undefined) ?? suggested;
    return ok({
      status: t.operational_status,
      per_service: Boolean((terms as { invoice_per_service?: boolean }).invoice_per_service),
      has_voucher: Boolean(t.client_voucher_path),
      invoice,
      suggested_due: suggested,
      driver_payout_if_due: driverPayoutDateFromClientDue(due, (terms as { reconciliation_business_days?: number | null }).reconciliation_business_days),
      forecast_due_without_invoice: clientDueDate(spDay(t.scheduled_at as string), terms)
    });
  } catch (error) {
    return mapApiError(error);
  }
}

const bodySchema = z.object({ due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Fecha este serviço: cria a fatura com a corrida (e os outros trechos do mesmo voucher) e o vencimento do boleto. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Só admin ou financeiro faturam", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const r = await generateInvoiceForTrip({ tenantId, tripId: id, dueDate: body.due_date, createdBy: session.userId }).catch((e: Error) => e);
    if (r instanceof Error) return fail("INVOICE_FAILED", r.message, 409);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "invoice.per_service",
      entityType: "client_invoice",
      entityId: r.invoice_id,
      metadata: { trip_ids: r.trip_ids, due_date: body.due_date },
      request
    });
    return ok(r, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
