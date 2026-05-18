export function driverStatusPushEventType(toStatus: string, fromStatus: string, driverId: string | null): string | null {
  if (!driverId) return null;
  if (toStatus === "completed") return "trip.completed";
  if (toStatus === "cancelled") return "trip.cancelled";
  if (toStatus === "no_show") return "trip.no_show";
  if (toStatus === "dispatched" && fromStatus !== "dispatched") return "trip.dispatched";
  return null;
}
