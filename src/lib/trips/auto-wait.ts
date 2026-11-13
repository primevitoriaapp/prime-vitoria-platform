/**
 * Espera que conta sozinha: do "Cheguei" até o passageiro embarcar.
 * Se o motorista chegou antes do horário marcado, conta só a partir do horário.
 */
export function autoWaitMinutes(arrivedAtIso: string, scheduledAtIso: string, boardedAt: Date): number {
  const arrived = new Date(arrivedAtIso).getTime();
  const scheduled = new Date(scheduledAtIso).getTime();
  if (!Number.isFinite(arrived)) return 0;
  const from = Number.isFinite(scheduled) ? Math.max(arrived, scheduled) : arrived;
  return Math.max(0, Math.floor((boardedAt.getTime() - from) / 60000));
}
