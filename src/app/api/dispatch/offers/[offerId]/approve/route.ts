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

    const { data: trip, error: tripLoadError } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id")
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

    await enqueueNotificationJob(
      {
        eventType: "trip_dispatched",
        recipientType: "driver",
        recipientId: body.driver_id,
        tripId: offer.trip_id
      },
      { tenantId }
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
