import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { canTransition } from "@/lib/domain/status";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { tryAutoDirectAssignAfterApprove } from "@/lib/dispatch/auto-direct-assign-after-approve";
import { loadDispatchAutomationSettings, tryAutoDispatchOfferAfterApprove } from "@/lib/dispatch/auto-offer-after-approve";
import { ensureOperationalClaimForMutation } from "@/lib/trips/operational-claim-mutation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const { id } = await params;
    const tenantId = assertTenantScope(session);

    const { data: trip, error: getError } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (getError || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    if (!canTransition(trip.operational_status, "approved")) {
      return fail("INVALID_STATUS_TRANSITION", "Cannot approve trip", 409);
    }

    const claimCheck = await ensureOperationalClaimForMutation(session, tenantId, id, request);
    if (!claimCheck.ok) {
      return fail(claimCheck.code, claimCheck.message, claimCheck.code === "CLAIM_NOT_OWNER" ? 403 : 409);
    }

    const { data, error } = await db
      .from("trips")
      .update({ operational_status: "approved", approved_by: session.userId, approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("TRIP_APPROVE_FAILED", error.message, 500);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.approve",
      entityType: "trip",
      entityId: id,
      metadata: { from_status: trip.operational_status },
      request
    });

    const { notifyTripApproved } = await import("@/lib/notifications/operational-notify");
    await notifyTripApproved(tenantId, id);

    const automation = await loadDispatchAutomationSettings(tenantId);
    // Exclusividade: despacho direto automático OU oferta automática (nunca ambos).
    if (automation.auto_direct_assign_on_approve) {
      await tryAutoDirectAssignAfterApprove({
        tenantId,
        tripId: id,
        scheduledAtIso: trip.scheduled_at,
        actorUserId: session.userId,
        request
      });
    } else if (automation.auto_offer_on_approve) {
      await tryAutoDispatchOfferAfterApprove({
        tenantId,
        tripId: id,
        scheduledAtIso: trip.scheduled_at,
        actorUserId: session.userId,
        request
      });
    }

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
