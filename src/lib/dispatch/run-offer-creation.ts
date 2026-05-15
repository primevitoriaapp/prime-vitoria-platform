import { z } from "zod";
import { db } from "@/lib/server/db";
import { enqueueNotificationJob } from "@/lib/notifications/events";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";

export type OfferCreationFailure = { ok: false; code: string; message: string };
export type OfferCreationSuccess = { ok: true; offerId: string };

/**
 * Cria oferta via RPC e enfileira notificações. Em falha de notificação reverte oferta e jobs.
 */
export async function runDispatchOfferRpcAndNotify(opts: {
  tripId: string;
  tenantId: string;
  expiresInSeconds: number;
  candidateDriverIds: string[];
  createdByUserId: string | null;
}): Promise<OfferCreationSuccess | OfferCreationFailure> {
  const { tripId, tenantId, expiresInSeconds, candidateDriverIds, createdByUserId } = opts;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);

  const p_created_by = z.string().uuid().safeParse(createdByUserId).success ? createdByUserId : null;

  const { data: offerIdRaw, error: rpcError } = await db.rpc("create_dispatch_offer_with_recipients", {
    p_trip_id: tripId,
    p_expires_at: expiresAt.toISOString(),
    p_created_by,
    p_driver_ids: candidateDriverIds
  });

  if (rpcError) {
    if (isPostgresUniqueViolation(rpcError)) {
      return { ok: false, code: "OFFER_RECIPIENTS_DUPLICATE", message: "Destinatario duplicado ou oferta ja contem este motorista" };
    }
    return { ok: false, code: "OFFER_CREATE_FAILED", message: rpcError.message };
  }

  const offerIdParsed = z.string().uuid().safeParse(offerIdRaw);
  if (!offerIdParsed.success) {
    return { ok: false, code: "OFFER_CREATE_FAILED", message: "RPC retornou id de oferta invalido" };
  }
  const offerId = offerIdParsed.data;

  const { data: offer, error: offerFetchError } = await db.from("dispatch_offers").select("*").eq("id", offerId).single();
  if (offerFetchError || !offer) {
    return { ok: false, code: "OFFER_CREATE_FAILED", message: offerFetchError?.message ?? "Oferta nao encontrada apos criacao" };
  }

  const notifyCorrelationId = crypto.randomUUID();
  try {
    await Promise.all(
      candidateDriverIds.map((driverId) =>
        enqueueNotificationJob(
          {
            eventType: "dispatch_offer_available",
            recipientType: "driver",
            recipientId: driverId,
            offerId: offer.id,
            tripId
          },
          { correlation_id: notifyCorrelationId }
        )
      )
    );
  } catch (notifyErr) {
    const msg = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
    await db.from("notification_jobs").delete().eq("correlation_id", notifyCorrelationId);
    await db.from("dispatch_offers").delete().eq("id", offer.id);
    return { ok: false, code: "OFFER_NOTIFY_FAILED", message: msg };
  }

  return { ok: true, offerId };
}
