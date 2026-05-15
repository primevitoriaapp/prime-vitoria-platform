import { loadDispatchAutomationSettings } from "@/lib/dispatch/auto-offer-after-approve";
import { listEligibleDriverIdsForScheduling, resolveDefaultVehicleIdForDriver } from "@/lib/dispatch/driver-availability";
import { enqueueNotificationJob } from "@/lib/notifications/events";
import { db } from "@/lib/server/db";
import { insertAuditEvent } from "@/lib/server/audit-log";

/**
 * Após aprovação: se configurado, despacha diretamente o primeiro motorista disponível
 * (sem conflito de agenda). Usa condição atómica na atualização para evitar corridas.
 */
export async function tryAutoDirectAssignAfterApprove(opts: {
  tenantId: string;
  tripId: string;
  scheduledAtIso: string;
  actorUserId: string;
  request: Request;
}): Promise<void> {
  const { tenantId, tripId, scheduledAtIso, actorUserId, request } = opts;
  const settings = await loadDispatchAutomationSettings(tenantId);
  if (!settings.auto_direct_assign_on_approve) {
    return;
  }

  const candidates = await listEligibleDriverIdsForScheduling({
    tenantId,
    scheduledAtIso,
    maxCount: 1
  });

  if (candidates.length === 0) {
    await insertAuditEvent({
      tenantId,
      actorUserId,
      action: "dispatch.auto_direct_skipped",
      entityType: "trip",
      entityId: tripId,
      metadata: { reason: "no_conflict_free_drivers" },
      request
    });
    return;
  }

  const driverId = candidates[0]!;
  const vehicleId = await resolveDefaultVehicleIdForDriver(driverId);

  const { data: updated, error } = await db
    .from("trips")
    .update({
      driver_id: driverId,
      vehicle_id: vehicleId,
      operational_status: "dispatched"
    })
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .eq("operational_status", "approved")
    .is("driver_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    await insertAuditEvent({
      tenantId,
      actorUserId,
      action: "dispatch.auto_direct_failed",
      entityType: "trip",
      entityId: tripId,
      metadata: { reason: "db_error", message: error.message },
      request
    });
    return;
  }

  if (!updated) {
    await insertAuditEvent({
      tenantId,
      actorUserId,
      action: "dispatch.auto_direct_skipped",
      entityType: "trip",
      entityId: tripId,
      metadata: { reason: "trip_state_changed_or_already_assigned" },
      request
    });
    return;
  }

  try {
    await enqueueNotificationJob(
      {
        eventType: "trip_dispatched",
        recipientType: "driver",
        recipientId: driverId,
        tripId
      },
      { tenantId }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await insertAuditEvent({
      tenantId,
      actorUserId,
      action: "dispatch.auto_direct_notify_failed",
      entityType: "trip",
      entityId: tripId,
      metadata: { driver_id: driverId, message },
      request
    });
  }

  await insertAuditEvent({
    tenantId,
    actorUserId,
    action: "trip.dispatch_auto_direct",
    entityType: "trip",
    entityId: tripId,
    metadata: { driver_id: driverId, vehicle_id: vehicleId },
    request
  });
}
