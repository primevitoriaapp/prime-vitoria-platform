import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { enqueueNotificationJob } from "@/lib/notifications/events";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";

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
    const body = createOfferSchema.parse(await request.json());

    const { data: trip, error: tripError } = await db
      .from("trips")
      .select("id, client_id, driver_id")
      .eq("id", body.trip_id)
      .single();
    if (tripError || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);
    const tripDenied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null })
    );
    if (tripDenied) return tripDenied;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + body.expires_in_seconds * 1000);

    const createdByUuid = z.string().uuid().safeParse(session.userId);
    const p_created_by = createdByUuid.success ? createdByUuid.data : null;

    const { data: offerIdRaw, error: rpcError } = await db.rpc("create_dispatch_offer_with_recipients", {
      p_trip_id: body.trip_id,
      p_expires_at: expiresAt.toISOString(),
      p_created_by,
      p_driver_ids: body.candidate_driver_ids
    });

    if (rpcError) {
      if (isPostgresUniqueViolation(rpcError)) {
        return fail("OFFER_RECIPIENTS_DUPLICATE", "Destinatario duplicado ou oferta ja contem este motorista", 409);
      }
      return fail("OFFER_CREATE_FAILED", rpcError.message, 500);
    }

    const offerIdParsed = z.string().uuid().safeParse(offerIdRaw);
    if (!offerIdParsed.success) {
      return fail("OFFER_CREATE_FAILED", "RPC retornou id de oferta invalido", 500);
    }
    const offerId = offerIdParsed.data;

    const { data: offer, error: offerFetchError } = await db.from("dispatch_offers").select("*").eq("id", offerId).single();
    if (offerFetchError || !offer) {
      return fail("OFFER_CREATE_FAILED", offerFetchError?.message ?? "Oferta nao encontrada apos criacao", 500);
    }

    const notifyCorrelationId = crypto.randomUUID();
    try {
      await Promise.all(
        body.candidate_driver_ids.map((driverId) =>
          enqueueNotificationJob(
            {
              eventType: "dispatch_offer_available",
              recipientType: "driver",
              recipientId: driverId,
              offerId: offer.id,
              tripId: body.trip_id
            },
            { correlation_id: notifyCorrelationId }
          )
        )
      );
    } catch (notifyErr) {
      const msg = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      await db.from("notification_jobs").delete().eq("correlation_id", notifyCorrelationId);
      await db.from("dispatch_offers").delete().eq("id", offer.id);
      return fail("OFFER_NOTIFY_FAILED", msg, 502);
    }

    return ok(offer, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
