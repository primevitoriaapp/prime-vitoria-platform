import { hasDispatchConflict } from "@/lib/dispatch/conflicts";
import { db } from "@/lib/server/db";

/**
 * Motoristas ativos do tenant, ordenados por criação, sem conflito de agenda
 * relativamente a `scheduledAtIso` (buffer igual a `hasDispatchConflict`).
 */
export async function listEligibleDriverIdsForScheduling(opts: {
  tenantId: string;
  scheduledAtIso: string;
  maxCount: number;
}): Promise<string[]> {
  const { tenantId, scheduledAtIso, maxCount } = opts;
  if (maxCount <= 0) return [];

  const { data: drivers, error: driversErr } = await db
    .from("drivers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(200);

  if (driversErr || !drivers?.length) {
    return [];
  }

  const driverIds = drivers.map((d) => d.id);
  const { data: busyTrips, error: schedErr } = await db
    .from("trips")
    .select("id, driver_id, scheduled_at, operational_status")
    .eq("tenant_id", tenantId)
    .in("driver_id", driverIds);

  if (schedErr) {
    return [];
  }

  const byDriver = new Map<string, { tripId: string; scheduledAt: string; status: string }[]>();
  for (const t of busyTrips ?? []) {
    if (!t.driver_id) continue;
    const list = byDriver.get(t.driver_id) ?? [];
    list.push({ tripId: t.id, scheduledAt: t.scheduled_at, status: t.operational_status });
    byDriver.set(t.driver_id, list);
  }

  const out: string[] = [];
  for (const d of drivers) {
    const sched = byDriver.get(d.id) ?? [];
    if (!hasDispatchConflict(sched, scheduledAtIso)) {
      out.push(d.id);
    }
    if (out.length >= maxCount) break;
  }
  return out;
}

export async function resolveDefaultVehicleIdForDriver(driverId: string): Promise<string | null> {
  const { data } = await db
    .from("driver_vehicle_links")
    .select("vehicle_id")
    .eq("driver_id", driverId)
    .eq("active", true)
    .is("end_at", null)
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.vehicle_id ?? null;
}
