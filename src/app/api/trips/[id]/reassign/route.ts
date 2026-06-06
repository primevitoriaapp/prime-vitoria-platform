import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { ensureOperationalClaimForMutation } from "@/lib/trips/operational-claim-mutation";
import { notifyDriverDispatchedNow } from "@/lib/notifications/send-driver-push-now";
import { dispatchConflict } from "@/lib/dispatch/conflicts";
import { runBestEffort } from "@/lib/server/best-effort";
import { planOperationalTransition } from "@/lib/domain/status";
import { shouldBlockOfflineDriverForTrip } from "@/lib/dispatch/driver-offline-dispatch";

const bodySchema = z.object({
  new_driver_id: z.string().uuid(),
  reason: z.string().min(3),
  vehicle_id: z.string().uuid().optional()
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

    const claimCheck = await ensureOperationalClaimForMutation(session, tenantId, id, request);
    if (!claimCheck.ok) {
      return fail(claimCheck.code, claimCheck.message, claimCheck.code === "CLAIM_NOT_OWNER" ? 403 : 409);
    }

    const { data: driver } = await db
      .from("drivers")
      .select("id, active, operational_status")
      .eq("id", body.new_driver_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!driver?.active) return fail("DRIVER_NOT_AVAILABLE", "Motorista inativo ou fora do tenant", 409);
    if (shouldBlockOfflineDriverForTrip(driver.operational_status, trip.scheduled_at)) {
      return fail(
        "DRIVER_OFFLINE",
        "Motorista está offline — reatribuição imediata exige parceiro online",
        409
      );
    }

    const { data: schedule } = await db
      .from("trips")
      .select("id, scheduled_at, operational_status")
      .eq("tenant_id", tenantId)
      .eq("driver_id", body.new_driver_id)
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
      return fail("DISPATCH_CONFLICT", "Motorista tem conflito de agenda neste horário", 409);
    }

    const plan = planOperationalTransition(trip.operational_status, "dispatched");
    if (!plan.ok) {
      return fail(
        "INVALID_STATUS_TRANSITION",
        `Reatribuição não permitida a partir de ${trip.operational_status}`,
        409
      );
    }

    await db.rpc("set_trip_status_audit_context", {
      p_source: "admin",
      p_changed_by: session.userId
    });

    const intermediate = plan.steps.slice(0, -1);
    for (const step of intermediate) {
      const { error: stepErr } = await db
        .from("trips")
        .update({ operational_status: step })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (stepErr) return fail("TRIP_REASSIGN_FAILED", stepErr.message, 500);
    }

    const update: Record<string, unknown> = {
      driver_id: body.new_driver_id,
      reassign_reason: body.reason,
      operational_status: plan.steps[plan.steps.length - 1]
    };
    if (body.vehicle_id) update.vehicle_id = body.vehicle_id;

    const { data, error } = await db
      .from("trips")
      .update(update)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("TRIP_REASSIGN_FAILED", error.message, 500);

    await db
      .from("drivers")
      .update({ operational_status: "ocupado", operational_status_updated_at: new Date().toISOString() })
      .eq("id", body.new_driver_id)
      .eq("tenant_id", tenantId);
    if (trip.driver_id && trip.driver_id !== body.new_driver_id) {
      await db
        .from("drivers")
        .update({ operational_status: "online", operational_status_updated_at: new Date().toISOString() })
        .eq("id", trip.driver_id)
        .eq("tenant_id", tenantId);
    }

    const { notifyTripReassignedToStaff } = await import("@/lib/notifications/operational-notify");
    await runBestEffort("trip.reassign.staff_notify", () =>
      notifyTripReassignedToStaff(tenantId, id, body.new_driver_id, (trip.driver_id as string | null) ?? null, {
        excludeActorProfileId: session.userId
      })
    );

    await runBestEffort("trip.reassign.driver_push", async () => {
      const result = await notifyDriverDispatchedNow(tenantId, body.new_driver_id, id);
      if (!result.ok) throw new Error(result.reason);
    });

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.reassign",
      entityType: "trip",
      entityId: id,
      metadata: {
        new_driver_id: body.new_driver_id,
        reason: body.reason,
        previous_driver_id: trip.driver_id,
        vehicle_id: body.vehicle_id ?? null
      },
      request
    });
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
