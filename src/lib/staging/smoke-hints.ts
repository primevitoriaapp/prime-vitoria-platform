/** Corrida seed oficial para smoke humano (ver seed-staging-operational.mjs). */
export const STAGING_SMOKE_TRIP_REQUESTED_ID = "c2000000-0000-4000-8000-000000000001";

export function isStagingSmokeHintsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STAGING_SMOKE_HINTS?.trim().toLowerCase() === "true";
}
