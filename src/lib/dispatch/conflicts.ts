export interface DriverScheduleItem {
  tripId: string;
  scheduledAt: string;
  status: string;
}

const ACTIVE_STATUSES = new Set(["dispatched", "accepted", "on_the_way", "arrived", "in_progress"]);

export function hasDispatchConflict(existing: DriverScheduleItem[], nextScheduledAtIso: string, bufferMinutes = 90): boolean {
  const target = new Date(nextScheduledAtIso).getTime();
  const bufferMs = bufferMinutes * 60 * 1000;

  return existing.some((item) => {
    if (!ACTIVE_STATUSES.has(item.status)) {
      return false;
    }

    const existingTime = new Date(item.scheduledAt).getTime();
    return Math.abs(existingTime - target) <= bufferMs;
  });
}
