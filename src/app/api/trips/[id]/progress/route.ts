import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { EDITABLE_STEPS, buildProgress } from "@/lib/trips/trip-progress";
import { parseTripPickupStops } from "@/lib/trips/trip-pickup-stops";
import { parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";
import { shortAddress } from "@/lib/client/short-address";

const COLS =
  "id, tenant_id, client_id, driver_id, created_by, created_at, operational_status, timeline_overrides, km_billable, actual_km, trip_pickup_stops, trip_dropoff_stops";

const isStaff = (role: string) => role === "admin" || role === "operador" || role === "financeiro";

/** Andamento da corrida passo a passo (gestor do cliente, solicitante e central). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: trip } = await db.from("trips").select(COLS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id as string,
        driver_id: (trip.driver_id as string | null) ?? null,
        tenant_id: trip.tenant_id as string,
        created_by: (trip.created_by as string | null) ?? null
      })
    );
    if (denied) return denied;
    const { data: hist } = await db
      .from("trip_status_history")
      .select("to_status, changed_at")
      .eq("trip_id", id)
      .order("changed_at", { ascending: true })
      .limit(100);

    const pickups = parseTripPickupStops(trip.trip_pickup_stops);
    const dropoffs = parseDropoffStops(trip.trip_dropoff_stops);
    const stops = [
      ...(pickups.length > 1 ? pickups.map((p) => ({ label: `Embarque confirmado: ${p.passenger_name}`, at: p.completed_at ?? null })) : []),
      ...dropoffs.map((x, i) => ({
        label: `${x.passenger_name?.trim() ? `${x.passenger_name.trim()} desembarcou` : `Parada ${i + 1} feita`} · ${shortAddress(x.address_text)}`,
        at: x.dropped_at ?? null
      }))
    ];
    const km = trip.km_billable != null ? Number(trip.km_billable) : trip.actual_km != null ? Number(trip.actual_km) : null;
    const out = buildProgress(
      trip.operational_status as string,
      trip.created_at as string,
      (hist ?? []).map((h) => ({ to_status: h.to_status as string, changed_at: h.changed_at as string })),
      { overrides: (trip.timeline_overrides as Record<string, string> | null) ?? null, km, stops }
    );
    // O cliente não vê que houve correção.
    const staff = isStaff(session.role);
    return ok({
      ...out,
      steps: out.steps.map((s) => (staff ? s : { ...s, edited: undefined })),
      ...(staff ? { overrides: trip.timeline_overrides ?? {}, km } : {})
    });
  } catch (error) {
    return mapApiError(error);
  }
}

const patchSchema = z.object({
  /** Passo → horário ISO, ou null para voltar ao horário registrado pelo app. */
  overrides: z.record(z.enum(EDITABLE_STEPS), z.string().datetime({ offset: true }).nullable())
});

/** Central corrige os horários da linha do tempo (o que o cliente vê). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!isStaff(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("VALIDATION_ERROR", "Horários inválidos", 400);
    const { data: trip } = await db.from("trips").select("id, timeline_overrides").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const next: Record<string, string> = { ...((trip.timeline_overrides as Record<string, string> | null) ?? {}) };
    for (const [k, v] of Object.entries(parsed.data.overrides)) {
      if (v) next[k] = new Date(v).toISOString();
      else delete next[k];
    }
    await db.from("trips").update({ timeline_overrides: Object.keys(next).length ? next : null }).eq("id", id).eq("tenant_id", tenantId);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.timeline_edit",
      entityType: "trip",
      entityId: id,
      metadata: { horarios: parsed.data.overrides }
    }).catch(() => undefined);
    return ok({ overrides: next });
  } catch (error) {
    return mapApiError(error);
  }
}
