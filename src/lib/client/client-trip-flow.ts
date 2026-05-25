import type { TripOperationalStatus } from "../domain/types.ts";

/** Estados visíveis no portal cliente (read-only). */
export const CLIENT_TRIP_FLOW: TripOperationalStatus[] = [
  "requested",
  "approved",
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed"
];

export const CLIENT_TERMINAL_STATUSES: TripOperationalStatus[] = [
  "cancelled",
  "rejected",
  "no_show",
  "completed"
];

export function clientFlowIndex(status: TripOperationalStatus): number {
  return CLIENT_TRIP_FLOW.indexOf(status);
}

export function clientFlowSupportsTimeline(status: TripOperationalStatus): boolean {
  return clientFlowIndex(status) >= 0;
}
