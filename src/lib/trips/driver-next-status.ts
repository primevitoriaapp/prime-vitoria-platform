import type { TripOperationalStatus } from "../domain/types.ts";
import { canTransition } from "../domain/status.ts";

// Sem "aceitar": a central já define o motorista; o primeiro botão dele é "A caminho".
const DRIVER_ACTION_ORDER: TripOperationalStatus[] = [
  "on_the_way",
  "arrived",
  "in_progress",
  "completed",
  "no_show"
];

/** Próximos estados que o motorista pode aplicar na corrida ativa. */
export function driverNextStatuses(current: TripOperationalStatus): TripOperationalStatus[] {
  return DRIVER_ACTION_ORDER.filter((to) => canTransition(current, to));
}
