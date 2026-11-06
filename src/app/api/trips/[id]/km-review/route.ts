import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { actualKmFromTrail, gpsTrailGaps } from "@/lib/trips/km-distance";
import { odometerDistance, parseOdometer } from "@/lib/trips/odometer";
import { applyTripPricingOnCompletion, computeCategoryPricing } from "@/lib/pricing/apply-trip-pricing";

const COLS =
  "id, client_id, driver_id, operational_status, service_mode, scheduled_at, odometer_start, odometer_end, actual_km, planned_km, km_billable, km_source, client_amount, driver_amount, review_required, review_reason, reviewed_at, client_invoice_id, wait_minutes";

async function staffOnly() {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "operador" && session.role !== "financeiro") return { session, denied: fail("FORBIDDEN", "Sem permissão", 403) };
  return { session, denied: null };
}

async function gpsKm(tripId: string) {
  const { data: pts } = await db.from("driver_locations").select("lat, lng, recorded_at").eq("trip_id", tripId).order("recorded_at").limit(5000);
  const trail = (pts ?? []).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), recorded_at: p.recorded_at as string }));
  return { km: actualKmFromTrail(trail), gaps: gpsTrailGaps(trail).gaps, points: trail.length };
}

async function lockState(tripId: string, invoiceId: unknown) {
  const [{ data: ar }, { data: dp }] = await Promise.all([
    db.from("accounts_receivable").select("status").eq("trip_id", tripId).maybeSingle(),
    db.from("driver_payables").select("status").eq("trip_id", tripId).maybeSingle()
  ]);
  if (invoiceId) return "Corrida já está numa fatura: o valor não muda sozinho (ajuste a fatura).";
  if (ar && ar.status !== "open") return "O cliente já pagou esta corrida.";
  if (dp && dp.status !== "open") return "O repasse do motorista já foi pago.";
  return null;
}

/** Conferência de KM pela central: painel do motorista × GPS × KM cobrado. */
/** Prévia: quanto fica com este KM e esta espera, sem gravar (?preview=1&km=34&wait=30). */
async function preview(request: Request, id: string, tenantId: string, clientId: string, actorUserId: string, t: Record<string, unknown>) {
  const u = new URL(request.url);
  const kmQ = u.searchParams.get("km");
  const waitQ = u.searchParams.get("wait");
  const km = kmQ != null && kmQ !== "" ? Number(kmQ.replace(",", ".")) : t.km_billable != null ? Number(t.km_billable) : t.actual_km != null ? Number(t.actual_km) : null;
  const wait = waitQ != null && waitQ !== "" ? Math.max(0, Math.round(Number(waitQ))) : Number(t.wait_minutes ?? 0) || 0;
  const p = await computeCategoryPricing({
    tripId: id,
    tenantId,
    clientId,
    actorUserId,
    kmReal: km != null && Number.isFinite(km) ? km : null,
    kmPlanned: t.planned_km == null ? null : Number(t.planned_km),
    scheduledAt: t.scheduled_at as string,
    // Por KM: sempre pela tabela. Transfer/diária com valor combinado: mantém o combinado e soma a espera.
    forceTable: t.service_mode === "km",
    waitMinutes: wait
  }).catch(() => null);
  if (!p) return ok({ by_table: false });
  return ok({
    by_table: true,
    km: p.km,
    base_client: p.table.client,
    base_driver: p.table.partner,
    detail: p.table.detail,
    wait_minutes: p.wait.wait_minutes,
    wait_billable_minutes: p.wait.billable_minutes,
    wait_tolerance_minutes: p.wait.tolerance_minutes,
    wait_client: p.wait.client_amount,
    wait_driver: p.wait.driver_amount,
    client_amount: p.client,
    driver_amount: p.driverAmount
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await staffOnly();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: t } = await db.from("trips").select(COLS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!t) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (new URL(request.url).searchParams.get("preview") === "1") {
      return await preview(request, id, tenantId, t.client_id as string, session.userId, t as unknown as Record<string, unknown>);
    }
    const gps = await gpsKm(id);
    const start = t.odometer_start == null ? null : Number(t.odometer_start);
    const end = t.odometer_end == null ? null : Number(t.odometer_end);
    return ok({
      status: t.operational_status,
      service_mode: t.service_mode,
      odometer_start: start,
      odometer_end: end,
      odometer_km: start != null && end != null && end > start ? Math.round((end - start) * 10) / 10 : null,
      gps_km: gps.km,
      gps_gaps: gps.gaps,
      gps_points: gps.points,
      billed_km: t.km_billable != null ? Number(t.km_billable) : t.actual_km != null ? Number(t.actual_km) : null,
      km_source: t.km_source,
      client_amount: t.client_amount != null ? Number(t.client_amount) : null,
      driver_amount: t.driver_amount != null ? Number(t.driver_amount) : null,
      review_required: Boolean(t.review_required),
      review_reason: t.review_reason ?? null,
      reviewed_at: t.reviewed_at ?? null,
      locked: await lockState(id, t.client_invoice_id)
    });
  } catch (error) {
    return mapApiError(error);
  }
}

const bodySchema = z.object({
  /** "keep" = mantém o KM atual (ex.: só corrigir a espera). */
  choice: z.enum(["odometer", "gps", "manual", "keep"]),
  /** Minutos de espera/atraso do passageiro (cobra o que passar da tolerância do cliente). */
  wait_minutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  /** Recalcula pela tabela mesmo se a corrida tinha valor combinado (conferência na aprovação). */
  recalc: z.boolean().optional(),
  odometer_start: z.union([z.string(), z.number()]).optional().nullable(),
  odometer_end: z.union([z.string(), z.number()]).optional().nullable(),
  km: z.coerce.number().positive().max(3000).optional()
});

/** Central confirma (ou corrige) o KM da corrida e o sistema recalcula cliente, motorista, conta a receber e repasse. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, denied } = await staffOnly();
    if (denied) return denied;
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const { data: t } = await db.from("trips").select(COLS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!t) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const lock = await lockState(id, t.client_invoice_id);
    if (lock) return fail("TRIP_LOCKED", lock, 409);

    const update: Record<string, unknown> = {};
    let km: number | null = null;
    if (body.choice === "odometer") {
      const start = body.odometer_start !== undefined ? parseOdometer(body.odometer_start) : t.odometer_start == null ? null : Number(t.odometer_start);
      const end = body.odometer_end !== undefined ? parseOdometer(body.odometer_end) : t.odometer_end == null ? null : Number(t.odometer_end);
      const dist = odometerDistance(start, end);
      if (!dist.ok) return fail("ODOMETER_INVALID", dist.message, 400);
      km = dist.km;
      update.odometer_start = start;
      update.odometer_end = end;
      update.km_source = "odometer";
    } else if (body.choice === "gps") {
      const g = await gpsKm(id);
      if (!g.km) return fail("NO_GPS", "Esta corrida não tem rastro de GPS suficiente.", 400);
      km = g.km;
      update.km_source = "gps_trail";
    } else if (body.choice === "keep") {
      km = t.km_billable != null ? Number(t.km_billable) : t.actual_km != null ? Number(t.actual_km) : null;
    } else {
      if (!body.km) return fail("KM_REQUIRED", "Informe o KM.", 400);
      km = Math.round(body.km * 10) / 10;
      update.km_source = "manual";
    }
    const now = new Date().toISOString();
    if (body.choice !== "keep") Object.assign(update, { actual_km: km, km_updated_at: now });
    Object.assign(update, { reviewed_at: now, review_required: false });
    if (body.wait_minutes !== undefined) Object.assign(update, { wait_minutes: body.wait_minutes, wait_started_at: null });
    const { error } = await db.from("trips").update(update).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("KM_UPDATE_FAILED", error.message, 500);

    let pricing: unknown = null;
    if (t.operational_status === "completed") {
      pricing = await applyTripPricingOnCompletion({
        tripId: id,
        tenantId,
        clientId: t.client_id as string,
        actorUserId: session.userId,
        kmReal: km,
        kmPlanned: t.planned_km == null ? null : Number(t.planned_km),
        scheduledAt: t.scheduled_at as string,
        forceTable: body.recalc === true
      }).catch(() => null);
      // Conta a receber e repasse em aberto acompanham o novo valor.
      const { data: fin } = await db.from("trip_financials").select("amount_client, amount_driver").eq("trip_id", id).maybeSingle();
      if (fin) {
        if (fin.amount_client != null)
          await db.from("accounts_receivable").update({ amount: fin.amount_client }).eq("trip_id", id).eq("status", "open");
        if (fin.amount_driver != null)
          await db.from("driver_payables").update({ amount: fin.amount_driver }).eq("trip_id", id).eq("status", "open");
      }
    }
    const { data: after } = await db.from("trips").select("client_amount, driver_amount, km_billable").eq("id", id).maybeSingle();

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.km_review",
      entityType: "trip",
      entityId: id,
      metadata: {
        escolha: body.choice,
        ...(body.wait_minutes !== undefined ? { espera_antes: t.wait_minutes ?? 0, espera_depois: body.wait_minutes } : {}),
        km_antes: t.km_billable ?? t.actual_km,
        km_depois: km,
        cliente_antes: t.client_amount,
        cliente_depois: after?.client_amount ?? null,
        motorista_antes: t.driver_amount,
        motorista_depois: after?.driver_amount ?? null
      },
      request
    });
    return ok({ km, client_amount: after?.client_amount ?? null, driver_amount: after?.driver_amount ?? null, pricing });
  } catch (error) {
    return mapApiError(error);
  }
}
