import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability, can } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { actualKmFromTrail, plannedKmFromCoords } from "@/lib/trips/km-distance";
import { ensureOperationalClaimForMutation } from "@/lib/trips/operational-claim-mutation";

const patchSchema = z.object({
  mode: z.enum(["recalculate", "manual"]),
  planned_km: z.number().nonnegative().optional(),
  actual_km: z.number().nonnegative().optional()
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!can(session, "trip.read")) return fail("FORBIDDEN", "Sem visão de viagens", 403);
    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;

    const { data: trip, error } = await db
      .from("trips")
      .select(
        "id, client_id, driver_id, tenant_id, planned_km, actual_km, km_source, km_updated_at, origin_lat, origin_lng, destination_lat, destination_lng"
      )
      .eq("id", tripId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (denied) return denied;

    return ok({
      trip_id: tripId,
      planned_km: trip.planned_km != null ? Number(trip.planned_km) : null,
      actual_km: trip.actual_km != null ? Number(trip.actual_km) : null,
      km_source: trip.km_source,
      km_updated_at: trip.km_updated_at,
      coords_available:
        trip.origin_lat != null && trip.origin_lng != null && trip.destination_lat != null && trip.destination_lng != null
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;
    const body = patchSchema.parse(await request.json());

    const { data: trip, error } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id, origin_lat, origin_lng, destination_lat, destination_lng")
      .eq("id", tripId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (denied) return denied;

    const claimCheck = await ensureOperationalClaimForMutation(session, tenantId, tripId, request);
    if (!claimCheck.ok) {
      return fail(claimCheck.code, claimCheck.message, claimCheck.code === "CLAIM_NOT_OWNER" ? 403 : 409);
    }

    let planned: number | null = body.planned_km ?? null;
    let actual: number | null = body.actual_km ?? null;
    let kmSource: "coords" | "gps_trail" | "manual" | null = null;

    if (body.mode === "recalculate") {
      planned = plannedKmFromCoords(trip);
      if (trip.driver_id) {
        const { data: locs } = await db
          .from("driver_locations")
          .select("lat, lng, recorded_at")
          .eq("trip_id", tripId)
          .order("recorded_at", { ascending: true })
          .limit(500);
        actual = actualKmFromTrail(
          (locs ?? []).map((r) => ({
            lat: Number(r.lat),
            lng: Number(r.lng),
            recorded_at: r.recorded_at as string
          }))
        );
        if (actual != null) kmSource = "gps_trail";
      }
      if (planned != null && !kmSource) kmSource = "coords";
    } else {
      kmSource = "manual";
    }

    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await db
      .from("trips")
      .update({
        planned_km: planned,
        actual_km: actual,
        km_source: kmSource,
        km_updated_at: now
      })
      .eq("id", tripId)
      .eq("tenant_id", tenantId)
      .select("planned_km, actual_km, km_source, km_updated_at")
      .single();

    if (upErr) return fail("KM_UPDATE_FAILED", upErr.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.km_update",
      entityType: "trip",
      entityId: tripId,
      metadata: { mode: body.mode, planned_km: planned, actual_km: actual, km_source: kmSource },
      request
    });

    return ok({
      trip_id: tripId,
      planned_km: updated.planned_km != null ? Number(updated.planned_km) : null,
      actual_km: updated.actual_km != null ? Number(updated.actual_km) : null,
      km_source: updated.km_source,
      km_updated_at: updated.km_updated_at
    });
  } catch (error) {
    return mapApiError(error);
  }
}
