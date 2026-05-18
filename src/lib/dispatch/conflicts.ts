export interface DriverScheduleItem {
  tripId: string;
  scheduledAt: string;
  status: string;
}

const ACTIVE_STATUSES = new Set(["dispatched", "accepted", "reassigned", "on_the_way", "arrived", "in_progress"]);

export function isDispatchActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function dispatchConflict(
  existing: DriverScheduleItem[],
  nextScheduledAtIso: string,
  bufferMinutes = 90,
  ignoreTripId?: string
): DriverScheduleItem | null {
  const target = new Date(nextScheduledAtIso).getTime();
  const bufferMs = bufferMinutes * 60 * 1000;
  if (!Number.isFinite(target)) return null;

  for (const item of existing) {
    if (ignoreTripId && item.tripId === ignoreTripId) continue;
    if (!isDispatchActiveStatus(item.status)) continue;

    const existingTime = new Date(item.scheduledAt).getTime();
    if (Number.isFinite(existingTime) && Math.abs(existingTime - target) <= bufferMs) return item;
  }
  return null;
}

export function hasDispatchConflict(
  existing: DriverScheduleItem[],
  nextScheduledAtIso: string,
  bufferMinutes = 90,
  ignoreTripId?: string
): boolean {
  return dispatchConflict(existing, nextScheduledAtIso, bufferMinutes, ignoreTripId) != null;
}
