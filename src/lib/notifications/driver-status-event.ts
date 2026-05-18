export function driverStatusPushEventType(toStatus: string, fromStatus: string, driverId: string | null): string | null {
  if (!driverId) return null;
  if (toStatus === "completed") return "trip.completed";
  if (toStatus === "cancelled") return "trip.cancelled";
  if (toStatus === "no_show") return "trip.no_show";
  if (toStatus === "dispatched" && fromStatus !== "dispatched") return "trip.dispatched";
  return null;
}

export function driverStatusPushPresentation(eventType: string, tripId: string): { title: string; body: string } {
  const shortId = tripId.slice(0, 8);
  switch (eventType) {
    case "trip.dispatched":
      return { title: "Nova corrida atribuída", body: `Corrida ${shortId}... disponível no painel do motorista.` };
    case "trip.completed":
      return { title: "Corrida concluída", body: `Corrida ${shortId}... finalizada.` };
    case "trip.cancelled":
      return { title: "Corrida cancelada", body: `Corrida ${shortId}... foi cancelada.` };
    case "trip.no_show":
      return { title: "No-show registrado", body: `Corrida ${shortId}... marcada como no-show.` };
    default:
      return { title: "Atualização de corrida", body: `Corrida ${shortId}... atualizada.` };
  }
}
