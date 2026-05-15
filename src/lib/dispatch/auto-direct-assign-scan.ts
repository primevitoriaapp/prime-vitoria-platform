import { loadDispatchAutomationSettings } from "@/lib/dispatch/auto-offer-after-approve";
import { listEligibleDriverIdsForScheduling, resolveDefaultVehicleIdForDriver } from "@/lib/dispatch/driver-availability";
import { enqueueNotificationJob } from "@/lib/notifications/events";
import { db } from "@/lib/server/db";
import { insertAuditEvent } from "@/lib/server/audit-log";

export type DispatchDirectScanResult = {
  tenants_scanned: number;
  trips_attempted: number;
  trips_assigned: number;
};

/**
 * Recupera viagens ainda `approved` sem motorista quando o tenant tem despacho direto automático ativo.
 * Útil após falhas transitórias ou correção de dados.
 */
export async function scanAndAssignStaleApprovedTrips(opts: {
  tenantId?: string | null;
  maxTripsPerTenant: number;
  request: Request | null;
}): Promise<DispatchDirectScanResult> {
  const { tenantId: filterTenant, maxTripsPerTenant, request } = opts;
  let tenants_scanned = 0;
  let trips_attempted = 0;
  let trips_assigned = 0;

  let tenantIds: string[] = [];
  if (filterTenant) {
    const settings = await loadDispatchAutomationSettings(filterTenant);
    if (settings.auto_direct_assign_on_approve) {
      tenantIds = [filterTenant];
    }
  } else {
    const { data: rows } = await db
      .from("dispatch_automation_settings")
      .select("tenant_id")
      .eq("auto_direct_assign_on_approve", true);
    tenantIds = (rows ?? []).map((r) => r.tenant_id as string);
  }

  for (const tid of tenantIds) {
    tenants_scanned += 1;
    const { data: trips } = await db
      .from("trips")
      .select("id, scheduled_at")
      .eq("tenant_id", tid)
      .eq("operational_status", "approved")
      .is("driver_id", null)
      .order("scheduled_at", { ascending: true })
      .limit(maxTripsPerTenant);

    for (const trip of trips ?? []) {
      trips_attempted += 1;
      const candidates = await listEligibleDriverIdsForScheduling({
        tenantId: tid,
        scheduledAtIso: trip.scheduled_at,
        maxCount: 1
      });
      if (candidates.length === 0) continue;

      const driverId = candidates[0]!;
      const vehicleId = await resolveDefaultVehicleIdForDriver(driverId);

      const { data: updated, error } = await db
        .from("trips")
        .update({
          driver_id: driverId,
          vehicle_id: vehicleId,
          operational_status: "dispatched"
        })
        .eq("id", trip.id)
        .eq("tenant_id", tid)
        .eq("operational_status", "approved")
        .is("driver_id", null)
        .select("id")
        .maybeSingle();

      if (error || !updated) continue;

      trips_assigned += 1;

      try {
        await enqueueNotificationJob(
          {
            eventType: "trip_dispatched",
            recipientType: "driver",
            recipientId: driverId,
            tripId: trip.id
          },
          { tenantId: tid }
        );
      } catch {
        // notificação falhou; viagem já despachada
      }

      await insertAuditEvent({
        tenantId: tid,
        actorUserId: null,
        action: "trip.dispatch_auto_direct_scan",
        entityType: "trip",
        entityId: trip.id,
        metadata: { driver_id: driverId, vehicle_id: vehicleId },
        request
      });
    }
  }

  return { tenants_scanned, trips_attempted, trips_assigned };
}
