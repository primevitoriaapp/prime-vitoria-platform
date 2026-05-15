import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runDispatchOfferRpcAndNotify } from "@/lib/dispatch/run-offer-creation";
import { assertOperationalClaimForAction } from "@/lib/trips/operational-claim-guard";

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
      .select("id, client_id, driver_id, tenant_id")
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

    const claimCheck = await assertOperationalClaimForAction(session, tenantId, body.trip_id);
    if (!claimCheck.ok) {
      return fail(claimCheck.code, claimCheck.message, claimCheck.code === "CLAIM_NOT_OWNER" ? 403 : 409);
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
