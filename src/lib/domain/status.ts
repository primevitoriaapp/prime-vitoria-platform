import type { TripOperationalStatus } from "./types";

export const ALLOWED_TRANSITIONS: Record<TripOperationalStatus, TripOperationalStatus[]> = {
  requested: ["approved", "cancelled"],
  approved: ["dispatched", "cancelled"],
  dispatched: ["accepted", "reassigned", "cancelled"],
  accepted: ["on_the_way", "reassigned", "cancelled"],
  on_the_way: ["arrived", "reassigned"],
  arrived: ["in_progress", "no_show"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  rejected: [],
  no_show: [],
  reassigned: ["dispatched", "cancelled"]
};

export function canTransition(from: TripOperationalStatus, to: TripOperationalStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
