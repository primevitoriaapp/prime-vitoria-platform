import type { TripOperationalStatus } from "../domain/types.ts";
import { canTransition } from "../domain/status.ts";

const DRIVER_ACTION_ORDER: TripOperationalStatus[] = [
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed",
  "no_show"
];

/** Próximos estados que o motorista pode aplicar na corrida activa. */
export function driverNextStatuses(current: TripOperationalStatus): TripOperationalStatus[] {
  return DRIVER_ACTION_ORDER.filter((to) => canTransition(current, to));
}
