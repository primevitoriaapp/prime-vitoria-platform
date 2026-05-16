export const OPERATIONAL_CLAIM_STALE_MINUTES = 45;

export function operationalClaimAgeMinutes(claimedAt: string, reference = new Date()): number {
  const claimed = Date.parse(claimedAt);
  if (!Number.isFinite(claimed)) return 0;
  return Math.max(0, Math.floor((reference.getTime() - claimed) / 60_000));
}

export function operationalClaimIsStale(claimedAt: string, reference = new Date()): boolean {
  return operationalClaimAgeMinutes(claimedAt, reference) >= OPERATIONAL_CLAIM_STALE_MINUTES;
}

export function operationalClaimConflictMessage(claimedAt?: string | null): string {
  if (!claimedAt) return "Outro operador tem o atendimento desta viagem. Libertar ou contactar administrador.";
  const age = operationalClaimAgeMinutes(claimedAt);
  const suffix = operationalClaimIsStale(claimedAt)
    ? " Claim antigo; contactar administrador para libertar."
    : " Libertar ou contactar administrador.";
  return `Outro operador tem o atendimento desta viagem ha ${age} min.${suffix}`;
}
