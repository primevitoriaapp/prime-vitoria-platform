import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { assertOperationalClaimForAction } from "@/lib/trips/operational-claim-guard";

const bodySchema = z.object({
  new_driver_id: z.string().uuid(),
  reason: z.string().min(3)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "dispatch");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const tenantId = assertTenantScope(session);

    const { data: trip, error: getError } = await db
      .from("trips")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();
    if (getError || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    const claimCheck = await assertOperationalClaimForAction(session, tenantId, id);
    if (!claimCheck.ok) {
      return fail(claimCheck.code, claimCheck.message, claimCheck.code === "CLAIM_NOT_OWNER" ? 403 : 409);
    }

    const { data, error } = await db
      .from("trips")
      .update({
        driver_id: body.new_driver_id,
        reassign_reason: body.reason,
        operational_status: "dispatched"
      })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("TRIP_REASSIGN_FAILED", error.message, 500);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.reassign",
      entityType: "trip",
      entityId: id,
      metadata: { new_driver_id: body.new_driver_id, reason: body.reason, previous_driver_id: trip.driver_id },
      request
    });
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
