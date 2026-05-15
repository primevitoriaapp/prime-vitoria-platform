import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

const bodySchema = z.object({
  eta_minutes: z.number().int().min(1).max(240).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.accept");
    if (!session.driverId) return fail("FORBIDDEN", "Motorista precisa de cadastro vinculado a sessao", 403);

    const body = bodySchema.parse(await request.json());
    const { offerId } = await params;
    const tenantId = assertTenantScope(session);

    const { data: offer } = await db.from("dispatch_offers").select("*").eq("id", offerId).eq("tenant_id", tenantId).single();
    if (!offer) return fail("OFFER_NOT_FOUND", "Offer not found", 404);
    if (offer.status !== "open") return fail("OFFER_CLOSED", "Offer is no longer open", 409);
    if (new Date(offer.expires_at).getTime() < Date.now()) return fail("OFFER_EXPIRED", "Offer expired", 409);

    const { data: recipient } = await db
      .from("dispatch_offer_recipients")
      .select("id")
      .eq("offer_id", offerId)
      .eq("driver_id", session.driverId)
      .maybeSingle();
    if (!recipient) {
      return fail("OFFER_NOT_ELIGIBLE", "Motorista nao esta na lista de candidatos desta oferta", 403);
    }

    const { error } = await db.from("dispatch_offer_responses").insert({
      offer_id: offerId,
      driver_id: session.driverId,
      status: "accepted",
      eta_minutes: body.eta_minutes
    });

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        return fail("OFFER_ALREADY_RESPONDED", "Voce ja respondeu a esta oferta", 409);
      }
      return fail("OFFER_ACCEPT_FAILED", error.message, 500);
    }
    return ok({ accepted: true });
  } catch (error) {
    return mapApiError(error);
  }
}
