import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runDispatchOfferRpcAndNotify } from "@/lib/dispatch/run-offer-creation";
import { ensureOperationalClaimForMutation } from "@/lib/trips/operational-claim-mutation";
import { dispatchConflict } from "@/lib/dispatch/conflicts";
import { shouldBlockOfflineDriverForTrip } from "@/lib/dispatch/driver-offline-dispatch";

const createOfferSchema = z.object({
  trip_id: z.string().uuid(),
  expires_in_seconds: z.number().int().min(30).max(3600).default(180),
  candidate_driver_ids: z
    .array(z.string().uuid())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "candidate_driver_ids nao pode repetir o mesmo motorista"
    })
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "dispatch");
    const tenantId = assertTenantScope(session);
    const body = createOfferSchema.parse(await request.json());

    const { data: trip, error: tripError } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id, scheduled_at")
      .eq("id", body.trip_id)
      .eq("tenant_id", tenantId)
      .single();
    if (tripError || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);
    const tripDenied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (tripDenied) return tripDenied;

    const claimCheck = await ensureOperationalClaimForMutation(session, tenantId, body.trip_id, request);
    if (!claimCheck.ok) {
      return fail(claimCheck.code, claimCheck.message, claimCheck.code === "CLAIM_NOT_OWNER" ? 403 : 409);
    }

    const { data: drivers } = await db
      .from("drivers")
      .select("id, active, operational_status")
      .eq("tenant_id", tenantId)
      .in("id", body.candidate_driver_ids);
    const driverById = new Map((drivers ?? []).map((driver) => [driver.id as string, driver]));
    const unavailableDriverId = body.candidate_driver_ids.find((driverId) => !driverById.get(driverId)?.active);
    if (unavailableDriverId) {
      return fail("DRIVER_NOT_AVAILABLE", `Motorista indisponível para oferta: ${unavailableDriverId}`, 409);
    }
    const offlineDriverId = body.candidate_driver_ids.find((driverId) => driverById.get(driverId)?.operational_status === "offline");
    if (offlineDriverId) {
      return fail("DRIVER_OFFLINE", `Motorista offline não pode receber oferta: ${offlineDriverId}`, 409);
    }

    const { data: candidateSchedules } = await db
      .from("trips")
      .select("id, driver_id, scheduled_at, operational_status")
      .eq("tenant_id", tenantId)
      .in("driver_id", body.candidate_driver_ids)
      .limit(500);
    for (const driverId of body.candidate_driver_ids) {
      const conflict = dispatchConflict(
        (candidateSchedules ?? [])
          .filter((s) => s.driver_id === driverId)
          .map((s) => ({
            tripId: s.id,
            scheduledAt: s.scheduled_at,
            status: s.operational_status
          })),
        trip.scheduled_at,
        90,
        body.trip_id
      );
      if (conflict) {
        return fail("DISPATCH_CONFLICT", "Motorista tem conflito de agenda neste horário", 409);
      }
    }

    const createdByUuid = z.string().uuid().safeParse(session.userId);
    const p_created_by = createdByUuid.success ? createdByUuid.data : null;

    const created = await runDispatchOfferRpcAndNotify({
      tripId: body.trip_id,
      tenantId,
      expiresInSeconds: body.expires_in_seconds,
      candidateDriverIds: body.candidate_driver_ids,
      createdByUserId: p_created_by
    });

    if (!created.ok) {
      const status = created.code === "OFFER_NOTIFY_FAILED" ? 502 : created.code === "OFFER_RECIPIENTS_DUPLICATE" ? 409 : 500;
      return fail(created.code, created.message, status);
    }

    const { data: offer, error: offerFetchError } = await db.from("dispatch_offers").select("*").eq("id", created.offerId).single();
    if (offerFetchError || !offer) {
      return fail("OFFER_CREATE_FAILED", offerFetchError?.message ?? "Oferta nao encontrada apos criacao", 500);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "dispatch.offer_create",
      entityType: "dispatch_offer",
      entityId: offer.id,
      metadata: { trip_id: body.trip_id, candidate_count: body.candidate_driver_ids.length },
      request
    });

    return ok(offer, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
