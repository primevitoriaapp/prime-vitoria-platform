/** Ligação agenda com intervalo de datas que inclui a viagem (evita painel com estado errado). */
export function buildAgendaTripHref(tripId: string, scheduledAt: string): string {
  const d = new Date(scheduledAt);
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 2);
  end.setUTCHours(23, 59, 59, 999);
  const p = new URLSearchParams({
    trip: tripId,
    scheduledFrom: start.toISOString(),
    scheduledTo: end.toISOString()
  });
  return `/agenda?${p.toString()}`;
}
