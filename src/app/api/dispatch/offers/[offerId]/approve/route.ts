import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { ensureOperationalClaimForMutation } from "@/lib/trips/operational-claim-mutation";
import { enqueueNotificationJob } from "@/lib/notifications/events";
import { driverDispatchedPushPayload } from "@/lib/notifications/driver-status-event";
import { canTransition } from "@/lib/domain/status";
import { dispatchConflict } from "@/lib/dispatch/conflicts";
import { runBestEffort } from "@/lib/server/best-effort";
import { dispatchOfferIsExpired } from "@/lib/dispatch/offer-expiration";

const bodySchema = z.object({
  driver_id: z.string().uuid()
});

export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "dispatch");
    const body = bodySchema.parse(await request.json());
    const { offerId } = await params;
    const tenantId = assertTenantScope(session);

    const { data: offer } = await db.from("dispatch_offers").select("*").eq("id", offerId).eq("tenant_id", tenantId).single();
    if (!offer) return fail("OFFER_NOT_FOUND", "Offer not found", 404);
    if (offer.status !== "open") return fail("OFFER_CLOSED", "Offer already finalized", 409);
    if (dispatchOfferIsExpired(offer.expires_at)) return fail("OFFER_EXPIRED", "Offer expired", 409);

    const { data: trip, error: tripLoadError } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id, operational_status, scheduled_at")
      .eq("id", offer.trip_id)
      .eq("tenant_id", tenantId)
      .single();
    if (tripLoadError || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);
    const tripDenied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (tripDenied) return tripDenied;

    if (!canTransition(trip.operational_status, "dispatched")) {
      return fail("INVALID_STATUS_TRANSITION", "Trip cannot be dispatched", 409);
    }

    const { data: recipient } = await db
      .from("dispatch_offer_recipients")
      .select("id")
      .eq("offer_id", offerId)
      .eq("driver_id", body.driver_id)
      .maybeSingle();
    if (!recipient) return fail("OFFER_DRIVER_NOT_CANDIDATE", "Motorista não pertence a esta oferta", 409);

    const { data: acceptedResponse } = await db
      .from("dispatch_offer_responses")
      .select("id")
      .eq("offer_id", offerId)
      .eq("driver_id", body.driver_id)
      .eq("status", "accepted")
      .maybeSingle();
    if (!acceptedResponse) return fail("OFFER_DRIVER_NOT_ACCEPTED", "Motorista ainda não aceitou esta oferta", 409);

    const { data: driver } = await db
      .from("drivers")
      .select("id, active, operational_status")
      .eq("id", body.driver_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!driver?.active) return fail("DRIVER_NOT_AVAILABLE", "Motorista inativo ou fora do tenant", 409);
    if (driver.operational_status === "offline") {
      return fail("DRIVER_OFFLINE", "Motorista está offline e não pode receber despacho", 409);
    }

    const { data: schedule } = await db
      .from("trips")
      .select("id, scheduled_at, operational_status")
      .eq("tenant_id", tenantId)
      .eq("driver_id", body.driver_id)
      .limit(100);
    const conflict = dispatchConflict(
      (schedule ?? []).map((s) => ({
        tripId: s.id,
        scheduledAt: s.scheduled_at,
        status: s.operational_status
      })),
      trip.scheduled_at,
      90,
      trip.id
    );
    if (conflict) return fail("DISPATCH_CONFLICT", `Motorista tem conflito com a viagem ${conflict.tripId}`, 409);

    const claimCheck = await ensureOperationalClaimForMutation(session, tenantId, offer.trip_id, request);
    if (!claimCheck.ok) {
      return fail(claimCheck.code, claimCheck.message, claimCheck.code === "CLAIM_NOT_OWNER" ? 403 : 409);
    }

    const { error: tripError } = await db
      .from("trips")
      .update({
        driver_id: body.driver_id,
        operational_status: "dispatched",
        dispatch_mode: "offer"
      })
      .eq("id", offer.trip_id)
      .eq("tenant_id", tenantId);
    if (tripError) return fail("TRIP_ASSIGN_FAILED", tripError.message, 500);

    const { error: offerError } = await db
      .from("dispatch_offers")
      .update({
        status: "approved",
        approved_driver_id: body.driver_id,
        approved_by: session.userId,
        approved_at: new Date().toISOString()
      })
      .eq("id", offerId)
      .eq("tenant_id", tenantId);

    if (offerError) return fail("OFFER_APPROVE_FAILED", offerError.message, 500);

    await db
      .from("drivers")
      .update({ operational_status: "ocupado", operational_status_updated_at: new Date().toISOString() })
      .eq("id", body.driver_id)
      .eq("tenant_id", tenantId);

    const { notifyTripDispatchedToStaff } = await import("@/lib/notifications/operational-notify");
    await runBestEffort("dispatch.offer_approve.staff_notify", () =>
      notifyTripDispatchedToStaff(tenantId, offer.trip_id, body.driver_id, {
        dispatch_mode: "offer",
        excludeActorProfileId: session.userId
      })
    );

    await runBestEffort("dispatch.offer_approve.driver_push", () =>
      enqueueNotificationJob(
        driverDispatchedPushPayload(body.driver_id, offer.trip_id),
        { tenantId, correlation_id: `trip-${offer.trip_id}-offer-${offerId}-${body.driver_id}` }
      )
    );

    await db
      .from("dispatch_offer_responses")
      .update({ status: "rejected" })
      .eq("offer_id", offerId)
      .neq("driver_id", body.driver_id)
      .eq("status", "accepted");

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "dispatch.offer_approve",
      entityType: "dispatch_offer",
      entityId: offerId,
      metadata: { trip_id: offer.trip_id, driver_id: body.driver_id },
      request
    });

    return ok({ approved: true, trip_id: offer.trip_id, driver_id: body.driver_id });
  } catch (error) {
    return mapApiError(error);
  }
}
