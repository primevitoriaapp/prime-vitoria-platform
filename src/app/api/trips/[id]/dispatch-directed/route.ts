import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { canTransition } from "@/lib/domain/status";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { dispatchConflict } from "@/lib/dispatch/conflicts";
import { enqueueNotificationJob } from "@/lib/notifications/events";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { ensureOperationalClaimForMutation } from "@/lib/trips/operational-claim-mutation";
import { runBestEffort } from "@/lib/server/best-effort";

const bodySchema = z.object({
  driver_id: z.string().uuid(),
  vehicle_id: z.string().uuid().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "dispatch");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const tenantId = assertTenantScope(session);

    const { data: trip } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null, tenant_id: trip.tenant_id })
    );
    if (denied) return denied;

    const claimCheck = await ensureOperationalClaimForMutation(session, tenantId, id, request);
    if (!claimCheck.ok) {
      return fail(claimCheck.code, claimCheck.message, claimCheck.code === "CLAIM_NOT_OWNER" ? 403 : 409);
    }

    if (!canTransition(trip.operational_status, "dispatched")) {
      return fail("INVALID_STATUS_TRANSITION", "Trip cannot be dispatched", 409);
    }

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
      id
    );
    if (conflict) {
      return fail("DISPATCH_CONFLICT", `Motorista tem conflito com a viagem ${conflict.tripId}`, 409);
    }

    const { data, error } = await db
      .from("trips")
      .update({
        driver_id: body.driver_id,
        vehicle_id: body.vehicle_id,
        operational_status: "dispatched"
      })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("DISPATCH_FAILED", error.message, 500);

    await db
      .from("drivers")
      .update({ operational_status: "ocupado", operational_status_updated_at: new Date().toISOString() })
      .eq("id", body.driver_id)
      .eq("tenant_id", tenantId);

    const { notifyTripDispatchedToStaff } = await import("@/lib/notifications/operational-notify");
    await runBestEffort("trip.dispatch_directed.staff_notify", () =>
      notifyTripDispatchedToStaff(tenantId, id, body.driver_id, {
        dispatch_mode: "directed",
        excludeActorProfileId: session.userId
      })
    );

    await runBestEffort("trip.dispatch_directed.driver_push", () =>
      enqueueNotificationJob(
        {
          eventType: "trip_dispatched",
          channel: "push",
          recipientType: "driver",
          recipientId: body.driver_id,
          tripId: id
        },
        { tenantId, correlation_id: `trip-${id}-dispatch-${body.driver_id}` }
      )
    );

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.dispatch_directed",
      entityType: "trip",
      entityId: id,
      metadata: { driver_id: body.driver_id, vehicle_id: body.vehicle_id ?? null },
      request
    });

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
