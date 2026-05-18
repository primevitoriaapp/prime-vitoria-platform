/** Texto PT-BR para distância de corrida (painel motorista). */
export function formatTripKmLine(trip: {
  planned_km?: number | null;
  actual_km?: number | null;
}): string | null {
  const planned = trip.planned_km != null ? Number(trip.planned_km) : null;
  const actual = trip.actual_km != null ? Number(trip.actual_km) : null;
  if (planned == null && actual == null) return null;
  if (actual != null && Number.isFinite(actual)) {
    const base = `${actual.toFixed(1)} km (realizado)`;
    if (planned != null && Number.isFinite(planned)) {
      return `${base} · planeado ${planned.toFixed(1)} km`;
    }
    return base;
  }
  if (planned != null && Number.isFinite(planned)) {
    return `${planned.toFixed(1)} km (planeado)`;
  }
  return null;
}
