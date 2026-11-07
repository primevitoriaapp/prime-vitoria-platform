/** Ranking do mês (puro): posição pelo número de corridas; empate decide pela pontualidade. */
export type DriverMonthStat = { driver_id: string; trips: number; on_time: number; with_arrival: number };

export function punctuality(s: Pick<DriverMonthStat, "on_time" | "with_arrival">): number | null {
  return s.with_arrival ? Math.round((s.on_time / s.with_arrival) * 100) : null;
}

export function rankOf(stats: DriverMonthStat[], driverId: string): { position: number | null; of: number } {
  const active = stats.filter((s) => s.trips > 0);
  const sorted = [...active].sort((a, b) => b.trips - a.trips || (punctuality(b) ?? 0) - (punctuality(a) ?? 0));
  const idx = sorted.findIndex((s) => s.driver_id === driverId);
  if (idx < 0) return { position: null, of: sorted.length };
  // Empate exato (mesmas corridas e pontualidade) divide a posição.
  const me = sorted[idx];
  const first = sorted.findIndex((s) => s.trips === me.trips && (punctuality(s) ?? 0) === (punctuality(me) ?? 0));
  return { position: first + 1, of: sorted.length };
}
