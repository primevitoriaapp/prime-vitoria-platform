export function dispatchOfferIsExpired(expiresAt: string, now = new Date()): boolean {
  const expiresAtMs = new Date(expiresAt).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) return true;
  return expiresAtMs <= nowMs;
}
