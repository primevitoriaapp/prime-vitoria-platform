export type OperationalTripStatusEvent = "cancelled" | "on_the_way" | "arrived" | "no_show";

const STATUS_EVENT_TYPES: Record<OperationalTripStatusEvent, string> = {
  cancelled: "operations.trip_cancelled",
  on_the_way: "operations.trip_on_the_way",
  arrived: "operations.trip_arrived",
  no_show: "operations.trip_no_show"
};

export function operationalTripStatusEventType(status: OperationalTripStatusEvent): string {
  return STATUS_EVENT_TYPES[status];
}
