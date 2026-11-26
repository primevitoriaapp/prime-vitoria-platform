import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { applyTripAmounts } from "@/lib/trips/apply-trip-amounts";
import { extraLine, type TripExtraKind } from "@/lib/trips/trip-extras";
import { waitChargeOf } from "@/lib/finance/client-invoice-report";

const STAFF = ["admin", "operador", "financeiro"];
const r2 = (n: number) => Math.round(n * 100) / 100;

const money = z.union([z.number(), z.string()]).transform((v) => {
  const t = String(v).trim();
  const n = typeof v === "number" ? v : Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n >= 0 ? r2(n) : NaN;
});

async function load(tenantId: string, id: string) {
  const { data: trip } = await db
    .from("trips")
    .select("id, client_id, vehicle_category_id, client_amount, driver_amount, driver_id, operational_status, client_invoice_id, client_ref, wait_minutes, calculation_metadata, charge_after_cancel, charge_reason, scheduled_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return trip;
}

/** Adicionais da corrida + valor sugerido da hora extra (tabela do cliente). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const trip = await load(tenantId, id);
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const [{ data: extras }, { data: prices }, inv] = await Promise.all([
      db.from("trip_extras").select("id, kind, description, minutes, client_amount, driver_amount, created_at").eq("trip_id", id).order("created_at"),
      trip.client_id && trip.vehicle_category_id
        ? db
            .from("client_category_prices")
            .select("service, enabled, client_price, partner_price")
            .eq("client_id", trip.client_id as string)
            .eq("category_id", trip.vehicle_category_id as string)
            .in("service", ["hora_extra", "hora_parada"])
        : Promise.resolve({ data: [] as { service: string; enabled: boolean; client_price: number | null; partner_price: number | null }[] }),
      trip.client_invoice_id
        ? db.from("client_invoices").select("id, number, status").eq("id", trip.client_invoice_id as string).maybeSingle()
        : Promise.resolve({ data: null })
    ]);
    const cell = (s: string) => (prices ?? []).find((p) => p.service === s && p.enabled !== false && p.client_price != null);
    const he = cell("hora_extra") ?? cell("hora_parada");
    const wait = waitChargeOf(trip.calculation_metadata, Number(trip.wait_minutes ?? 0) || 0);
    return ok({
      client_id: trip.client_id,
      client_ref: trip.client_ref ?? null,
      status: trip.operational_status,
      scheduled_at: trip.scheduled_at,
      charge_after_cancel: trip.charge_after_cancel === true,
      charge_reason: trip.charge_reason ?? null,
      client_amount: trip.client_amount == null ? null : Number(trip.client_amount),
      driver_amount: trip.driver_amount == null ? null : Number(trip.driver_amount),
      has_driver: Boolean(trip.driver_id),
      invoice: inv.data ? { id: inv.data.id, number: inv.data.number, status: inv.data.status } : null,
      app_wait: wait,
      hour_rate: he ? { client: Number(he.client_price), driver: he.partner_price == null ? null : Number(he.partner_price) } : null,
      extras: (extras ?? []).map((e) => ({ ...e, client_amount: Number(e.client_amount), driver_amount: Number(e.driver_amount), line: extraLine(e as never) }))
    });
  } catch (e) {
    return mapApiError(e);
  }
}

const postSchema = z.object({
  kind: z.enum(["hora_extra", "espera", "estacionamento", "pedagio", "outro"]),
  description: z.string().trim().max(120).optional().nullable(),
  minutes: z.coerce.number().int().min(0).max(24 * 60).optional().nullable(),
  client_amount: money,
  driver_amount: money.optional()
});

/** Lança um adicional: soma no valor da corrida (cliente e, se marcado, motorista). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = postSchema.parse(await request.json());
    if (!Number.isFinite(b.client_amount)) return fail("INVALID_AMOUNT", "Valor do cliente inválido", 400);
    const driverAdd = b.driver_amount != null && Number.isFinite(b.driver_amount) ? b.driver_amount : 0;
    if (b.kind === "outro" && !b.description) return fail("DESCRIPTION_REQUIRED", "Escreva o que é o adicional", 400);
    if ((b.kind === "hora_extra" || b.kind === "espera") && !(b.minutes && b.minutes > 0)) return fail("MINUTES_REQUIRED", "Informe quanto tempo", 400);

    const trip = await load(tenantId, id);
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (trip.client_invoice_id) return fail("TRIP_INVOICED", "Esta corrida já está numa fatura. Tire-a da fatura antes de lançar adicional.", 409);

    // Hora extra / espera na mão substitui a espera calculada pelo app (não cobra duas vezes).
    const { count: manualBefore } = await db.from("trip_extras").select("id", { count: "exact", head: true }).eq("trip_id", id).in("kind", ["hora_extra", "espera"]);
    const meta = trip.calculation_metadata as { wait?: { client_amount?: number; driver_amount?: number } } | null;
    const replacesWait = (b.kind === "hora_extra" || b.kind === "espera") && !manualBefore && meta?.wait;
    const waitC = replacesWait ? Number(meta?.wait?.client_amount) || 0 : 0;
    const waitD = replacesWait ? Number(meta?.wait?.driver_amount) || 0 : 0;

    const curC = Number(trip.client_amount) || 0;
    const curD = trip.driver_amount == null ? null : Number(trip.driver_amount);
    const newC = r2(Math.max(0, curC - waitC + b.client_amount));
    const newD = curD == null && driverAdd === 0 ? null : r2(Math.max(0, (curD ?? 0) - waitD + driverAdd));

    const { data: row, error } = await db
      .from("trip_extras")
      .insert({
        tenant_id: tenantId,
        trip_id: id,
        kind: b.kind,
        description: b.description || null,
        minutes: b.minutes ?? null,
        client_amount: b.client_amount,
        driver_amount: driverAdd,
        replaced_wait_client: waitC,
        replaced_wait_driver: waitD,
        created_by: session.userId
      })
      .select("id")
      .single();
    if (error) return fail("EXTRA_FAILED", error.message, 500);
    try {
      await applyTripAmounts(tenantId, id, newC, newD, { clearWait: Boolean(replacesWait) });
    } catch (e) {
      await db.from("trip_extras").delete().eq("id", row.id);
      return fail("EXTRA_FAILED", e instanceof Error ? e.message : "Falha ao somar no valor", 500);
    }
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.extra_added",
      entityType: "trip",
      entityId: id,
      metadata: { tipo: b.kind as TripExtraKind, minutos: b.minutes ?? null, cliente: b.client_amount, motorista: driverAdd, espera_do_app_substituida: waitC || null, valor_antes: curC, valor_depois: newC },
      request
    });
    return ok({ id: row.id, client_amount: newC, driver_amount: newD });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", e.issues[0]?.message ?? "Dados inválidos", 400);
    return mapApiError(e);
  }
}

/** Remove um adicional (desconta do valor da corrida). ?extra=<id> */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!STAFF.includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const extraId = new URL(request.url).searchParams.get("extra") ?? "";
    const trip = await load(tenantId, id);
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (trip.client_invoice_id) return fail("TRIP_INVOICED", "Esta corrida já está numa fatura. Tire-a da fatura antes de mexer nos adicionais.", 409);
    const { data: ex } = await db.from("trip_extras").select("*").eq("id", extraId).eq("trip_id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!ex) return fail("EXTRA_NOT_FOUND", "Adicional não encontrado", 404);
    const curC = Number(trip.client_amount) || 0;
    const curD = trip.driver_amount == null ? null : Number(trip.driver_amount);
    const newC = r2(Math.max(0, curC - Number(ex.client_amount)));
    const newD = curD == null ? null : r2(Math.max(0, curD - Number(ex.driver_amount)));
    await db.from("trip_extras").delete().eq("id", extraId);
    await applyTripAmounts(tenantId, id, newC, newD, { clearWait: false });
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "trip.extra_removed", entityType: "trip", entityId: id, metadata: { tipo: ex.kind, cliente: ex.client_amount, motorista: ex.driver_amount }, request });
    return ok({ client_amount: newC, driver_amount: newD });
  } catch (e) {
    return mapApiError(e);
  }
}
