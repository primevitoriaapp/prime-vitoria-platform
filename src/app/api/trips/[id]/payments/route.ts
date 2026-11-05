import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { packageForTrip } from "@/lib/finance/booking-payments";
import { BOOKING_PAYMENT_METHODS } from "@/lib/finance/booking-payments-core";
import { syncPrepaidReceivables } from "@/lib/finance/ensure-accounts-receivable";

async function staffOnly() {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "operador" && session.role !== "financeiro") return { session, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  return { session, denied: null };
}

/** Pagamentos já recebidos do cliente (sinal / na reserva) e quanto falta. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await staffOnly();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: t } = await db.from("trips").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!t) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    return ok(await packageForTrip(tenantId, id));
  } catch (e) {
    return mapApiError(e);
  }
}

const postSchema = z.object({
  /** Corridas que o pagamento cobre (pacote). Sem isso: o mesmo pacote dos pagamentos anteriores, ou só esta corrida. */
  trip_ids: z.array(z.string().uuid()).max(62).optional(),
  amount: z.coerce.number().positive().max(1_000_000),
  method: z.enum(Object.keys(BOOKING_PAYMENT_METHODS) as [string, ...string[]]),
  account: z.string().trim().max(120).nullable().optional(),
  installments: z.coerce.number().int().min(1).max(24).nullable().optional(),
  fee_amount: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).nullable().optional()
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await staffOnly();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("VALIDATION_ERROR", "Confira o valor, a forma e a data do pagamento.", 400);
    const body = parsed.data;
    const { data: t } = await db.from("trips").select("id, client_id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!t) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);

    let tripIds = body.trip_ids?.length ? [...new Set([id, ...body.trip_ids])] : null;
    if (!tripIds) tripIds = (await packageForTrip(tenantId, id)).trip_ids;
    const { data: own } = await db.from("trips").select("id, client_id").eq("tenant_id", tenantId).in("id", tripIds);
    if ((own ?? []).length !== tripIds.length || (own ?? []).some((x) => x.client_id !== t.client_id)) {
      return fail("VALIDATION_ERROR", "As corridas do pacote precisam ser do mesmo cliente.", 400);
    }

    const { data: row, error } = await db
      .from("booking_payments")
      .insert({
        tenant_id: tenantId,
        client_id: t.client_id,
        trip_ids: tripIds,
        amount: Math.round(body.amount * 100) / 100,
        method: body.method,
        account: body.account || null,
        installments: body.installments ?? null,
        fee_amount: body.fee_amount ?? null,
        paid_on: body.paid_on,
        notes: body.notes || null,
        created_by: /^[0-9a-f-]{36}$/i.test(String(session.userId ?? "")) ? session.userId : null
      })
      .select("id")
      .single();
    if (error || !row) return fail("INTERNAL_ERROR", "Não foi possível registrar o pagamento.", 500);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.prepayment",
      entityType: "trip",
      entityId: id,
      metadata: { valor: body.amount, forma: body.method, conta: body.account ?? null, corridas: tripIds.length, pago_em: body.paid_on }
    }).catch(() => undefined);
    await syncPrepaidReceivables(tenantId, tripIds).catch(() => undefined);
    return ok(await packageForTrip(tenantId, id));
  } catch (e) {
    return mapApiError(e);
  }
}

/** Apaga um lançamento errado: ?payment_id=… */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await staffOnly();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const pid = new URL(req.url).searchParams.get("payment_id") ?? "";
    if (!z.string().uuid().safeParse(pid).success) return fail("VALIDATION_ERROR", "Pagamento inválido", 400);
    const { data: p } = await db.from("booking_payments").select("id, amount, method, trip_ids").eq("id", pid).eq("tenant_id", tenantId).contains("trip_ids", [id]).maybeSingle();
    if (!p) return fail("NOT_FOUND", "Pagamento não encontrado", 404);
    await db.from("booking_payments").delete().eq("id", pid).eq("tenant_id", tenantId);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.prepayment_removed",
      entityType: "trip",
      entityId: id,
      metadata: { valor: p.amount, forma: p.method }
    }).catch(() => undefined);
    return ok(await packageForTrip(tenantId, id));
  } catch (e) {
    return mapApiError(e);
  }
}
