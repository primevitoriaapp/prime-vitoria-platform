import type { TripOperationalStatus } from "@/lib/domain/types";

/** Status visíveis na agenda operacional (abertas / em curso). */
export const AGENDA_OPERATIONAL_STATUSES = [
  "requested",
  "approved",
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress"
] as const satisfies readonly TripOperationalStatus[];

export function isAgendaOperationalStatus(status: string): status is (typeof AGENDA_OPERATIONAL_STATUSES)[number] {
  return (AGENDA_OPERATIONAL_STATUSES as readonly string[]).includes(status);
}
