export type TimelineNotificationPayload = {
  eventType?: unknown;
  channel?: unknown;
  recipientType?: unknown;
  recipientId?: unknown;
  tripId?: unknown;
  trip_id?: unknown;
};

export function notificationPayloadTripId(payload: TimelineNotificationPayload | null | undefined): string | null {
  const id = payload?.tripId ?? payload?.trip_id;
  return typeof id === "string" && id.trim() ? id : null;
}

export function notificationTimelineTitle(payload: TimelineNotificationPayload, status: string): string {
  const eventType = typeof payload.eventType === "string" ? payload.eventType : "notification";
  const channel = typeof payload.channel === "string" ? payload.channel : "unknown";
  return `${notificationEventLabel(eventType)} · ${channel} · ${status}`;
}

export function notificationEventLabel(eventType: string): string {
  switch (eventType) {
    case "trip_dispatched":
    case "trip.dispatched":
      return "Corrida despachada";
    case "trip.completed":
      return "Corrida concluída";
    case "trip.cancelled":
      return "Corrida cancelada";
    case "finance.driver_payable_open":
      return "Pagável motorista aberto";
    case "finance.accounts_receivable_open":
      return "Conta a receber aberta";
    case "operations.trip_requested":
      return "Solicitação operacional";
    case "operations.trip_approved":
      return "Corrida aprovada";
    case "operations.trip_claimed":
      return "Atendimento assumido";
    case "operations.trip_dispatched":
      return "Despacho operacional";
    case "operations.trip_reassigned":
      return "Reatribuição operacional";
    default:
      return eventType;
  }
}
