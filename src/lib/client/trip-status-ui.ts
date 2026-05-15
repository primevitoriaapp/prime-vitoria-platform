import type { TripOperationalStatus } from "@/lib/domain/types";

/** Corrida criada pelo cliente e ainda não aprovada pela operação. */
export function clientShowsAwaitingApproval(status: TripOperationalStatus): boolean {
  return status === "requested";
}
