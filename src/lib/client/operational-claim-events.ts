export const OPERATIONAL_CLAIM_CHANGED = "prime:operational-claim-changed";

export function notifyOperationalClaimChanged(tripId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPERATIONAL_CLAIM_CHANGED, { detail: { tripId } }));
}
