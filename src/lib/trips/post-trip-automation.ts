import { db } from "@/lib/server/db";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { enqueueNotificationJob } from "@/lib/notifications/events";
import { enqueueInAppForTenantRoles } from "@/lib/notifications/enqueue-for-profiles";
import { actualKmFromTrail, plannedKmFromCoords } from "@/lib/trips/km-distance";
import { ensureAccountsReceivableFromTripFinancials } from "@/lib/finance/ensure-accounts-receivable";
import { ensureDriverPayableFromTripFinancials } from "@/lib/finance/ensure-driver-payable";
import { postTripAutomationFailureMetadata } from "@/lib/trips/post-trip-automation-failure";

export type PostTripAutomationInput = {
  tripId: string;
  tenantId: string;
  actorUserId: string;
};

export type PostTripAutomationResult = {
  planned_km: number | null;
  actual_km: number | null;
};

export async function runPostTripAutomationSafely(input: PostTripAutomationInput): Promise<{
  ok: boolean;
  result?: PostTripAutomationResult;
  error?: { message: string; name?: string };
}> {
  try {
    const result = await runPostTripAutomation(input);
    return { ok: true, result };
  } catch (error) {
    const metadata = postTripAutomationFailureMetadata(error);
    await insertAuditEvent({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "trip.post_trip_automation_failed",
      entityType: "trip",
      entityId: input.tripId,
      metadata
    }).catch(() => undefined);
    return { ok: false, error: metadata };
  }
}

/** Após conclusão: recalcula KM, garante títulos financeiros a partir de `trip_financials`, auditoria e notificações. */
export async function runPostTripAutomation(input: PostTripAutomationInput): Promise<PostTripAutomationResult> {
  const { tripId, tenantId, actorUserId } = input;

  const { data: trip } = await db
    .from("trips")
    .select(
      "id, driver_id, origin_lat, origin_lng, destination_lat, destination_lng, planned_km, actual_km, operational_status"
    )
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!trip || trip.operational_status !== "completed") {
    return { planned_km: null, actual_km: null };
  }

  let planned = trip.planned_km != null ? Number(trip.planned_km) : plannedKmFromCoords(trip);
  let actual: number | null = null;
  let kmSource: "coords" | "gps_trail" | "manual" | null = null;

  if (trip.driver_id) {
    const { data: locs } = await db
      .from("driver_locations")
      .select("lat, lng, recorded_at")
      .eq("trip_id", tripId)
      .order("recorded_at", { ascending: true })
      .limit(500);

    const trail = (locs ?? []).map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lng),
      recorded_at: r.recorded_at as string
    }));
    actual = actualKmFromTrail(trail);
    if (actual != null) kmSource = "gps_trail";
  }

  if (planned == null) {
    planned = plannedKmFromCoords(trip);
    if (planned != null && !kmSource) kmSource = "coords";
  }

  const now = new Date().toISOString();
  await db
    .from("trips")
    .update({
      planned_km: planned,
      actual_km: actual ?? trip.actual_km,
      km_source: kmSource ?? (planned != null ? "coords" : trip.actual_km != null ? "manual" : null),
      km_updated_at: now
    })
    .eq("id", tripId)
    .eq("tenant_id", tenantId);

  await insertAuditEvent({
    tenantId,
    actorUserId,
    action: "trip.km_recalculated",
    entityType: "trip",
    entityId: tripId,
    metadata: { planned_km: planned, actual_km: actual, km_source: kmSource }
  });

  const dp = await ensureDriverPayableFromTripFinancials(tripId, tenantId);
  const driverPayableAutoCreated = Boolean(dp.created && dp.payable_id);
  if (driverPayableAutoCreated) {
    await insertAuditEvent({
      tenantId,
      actorUserId,
      action: "finance.driver_payable_auto",
      entityType: "driver_payable",
      entityId: dp.payable_id,
      metadata: { trip_id: tripId }
    });
  }

  const ar = await ensureAccountsReceivableFromTripFinancials(tripId, tenantId);
  if (ar.created && ar.receivable_id) {
    await insertAuditEvent({
      tenantId,
      actorUserId,
      action: "finance.accounts_receivable_auto",
      entityType: "accounts_receivable",
      entityId: ar.receivable_id,
      metadata: { trip_id: tripId }
    });
    await enqueueInAppForTenantRoles(
      tenantId,
      ["financeiro", "admin"],
      {
        eventType: "finance.accounts_receivable_open",
        tripId,
        receivable_id: ar.receivable_id
      },
      { correlation_id: `post-trip-${tripId}-ar` }
    );
  }

  const { data: payable } = await db
    .from("driver_payables")
    .select("id, driver_id, amount, status")
    .eq("trip_id", tripId)
    .eq("status", "open")
    .maybeSingle();

  if (payable?.driver_id && driverPayableAutoCreated) {
    await enqueueNotificationJob(
      {
        eventType: "finance.driver_payable_open",
        channel: "push",
        recipientType: "driver",
        recipientId: payable.driver_id,
        tripId,
        amount: payable.amount
      },
      { tenantId, correlation_id: `post-trip-${tripId}-driver` }
    );
    await enqueueInAppForTenantRoles(
      tenantId,
      ["financeiro", "admin"],
      {
        eventType: "finance.driver_payable_open",
        tripId,
        payable_id: payable.id,
        amount: payable.amount,
        driver_id: payable.driver_id
      },
      { correlation_id: `post-trip-${tripId}-finance` }
    );
  }

  return { planned_km: planned, actual_km: actual };
}
