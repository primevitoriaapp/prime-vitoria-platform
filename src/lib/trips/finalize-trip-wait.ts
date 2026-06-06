/** Converte intervalo de espera activo em minutos acumulados (mínimo 1 min). */
export function waitMinutesBetween(startIso: string, end: Date): number {
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start)) return 0;
  const diffMs = Math.max(0, end.getTime() - start);
  return Math.max(1, Math.ceil(diffMs / 60_000));
}

export function finalizeWaitFields(
  waitMinutes: number | null | undefined,
  waitStartedAt: string | null | undefined,
  now = new Date()
): { wait_minutes: number; wait_started_at: null } | null {
  if (!waitStartedAt) return null;
  const added = waitMinutesBetween(waitStartedAt, now);
  return {
    wait_minutes: (waitMinutes ?? 0) + added,
    wait_started_at: null
  };
}
