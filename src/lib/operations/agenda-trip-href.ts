/** Ligação agenda com intervalo de datas que inclui a viagem (evita painel com estado errado). */
export function buildAgendaTripHref(tripId: string, scheduledAt: string): string {
  const d = new Date(scheduledAt);
  if (!Number.isFinite(d.getTime())) {
    return `/agenda?trip=${encodeURIComponent(tripId)}`;
  }
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

/** Intervalo que cobre todos os trechos (ida + retorno em dias diferentes). */
export function buildAgendaTripHrefFromScheduleRange(
  tripId: string,
  fromIso: string,
  toIso: string
): string {
  const start = new Date(fromIso);
  const end = new Date(toIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return buildAgendaTripHref(tripId, fromIso);
  }
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCHours(23, 59, 59, 999);
  const p = new URLSearchParams({
    trip: tripId,
    scheduledFrom: start.toISOString(),
    scheduledTo: end.toISOString()
  });
  return `/agenda?${p.toString()}`;
}
