/** Corridas com menos de 30 min até o horário agendado exigem motorista online. */
export const IMMEDIATE_DISPATCH_THRESHOLD_MS = 30 * 60 * 1000;

export function isImmediateScheduledTrip(scheduledAt: string, now: Date = new Date()): boolean {
  const at = new Date(scheduledAt);
  if (!Number.isFinite(at.getTime())) return true;
  return at.getTime() - now.getTime() < IMMEDIATE_DISPATCH_THRESHOLD_MS;
}

export function shouldBlockOfflineDriverForTrip(
  driverOperationalStatus: string | null | undefined,
  tripScheduledAt: string,
  now: Date = new Date()
): boolean {
  if (driverOperationalStatus !== "offline") return false;
  return isImmediateScheduledTrip(tripScheduledAt, now);
}
