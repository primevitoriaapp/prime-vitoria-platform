export type TripKmSource = "coords" | "gps_trail" | "manual";

export function postTripKmSource(input: {
  plannedKm: number | null;
  actualKmFromTrail: number | null;
  previousActualKm: number | null;
}): TripKmSource | null {
  if (input.actualKmFromTrail != null) return "gps_trail";
  if (input.previousActualKm != null) return "manual";
  if (input.plannedKm != null) return "coords";
  return null;
}
