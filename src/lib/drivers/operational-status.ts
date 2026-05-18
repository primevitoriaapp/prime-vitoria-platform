import type { DriverOperationalStatus, TripOperationalStatus } from "@/lib/domain/types";

export const DRIVER_OPERATIONAL_STATUS_VALUES: DriverOperationalStatus[] = [
  "online",
  "ocupado",
  "deslocando",
  "no_local",
  "em_atendimento",
  "offline"
];

export const DRIVER_OPERATIONAL_STATUS_PT: Record<DriverOperationalStatus, string> = {
  online: "Online",
  ocupado: "Ocupado",
  deslocando: "Deslocando",
  no_local: "No local",
  em_atendimento: "Em atendimento",
  offline: "Offline"
};

export const DRIVER_MANUAL_STATUS_BLOCKING_TRIP_STATUSES = [
  "dispatched",
  "accepted",
  "reassigned",
  "on_the_way",
  "arrived",
  "in_progress"
] as const;

export function isDriverOperationalStatus(value: unknown): value is DriverOperationalStatus {
  return typeof value === "string" && DRIVER_OPERATIONAL_STATUS_VALUES.includes(value as DriverOperationalStatus);
}

export function driverOperationalStatusForTrip(
  status: TripOperationalStatus | string | null | undefined
): DriverOperationalStatus | null {
  switch (status) {
    case "dispatched":
    case "accepted":
    case "reassigned":
      return "ocupado";
    case "on_the_way":
      return "deslocando";
    case "arrived":
      return "no_local";
    case "in_progress":
      return "em_atendimento";
    case "completed":
    case "cancelled":
    case "rejected":
    case "no_show":
      return "online";
    default:
      return null;
  }
}

export function driverManualStatusBlockedByTrip(status: TripOperationalStatus | string | null | undefined): boolean {
  const derived = driverOperationalStatusForTrip(status);
  return derived !== null && derived !== "online";
}
