import { z } from "zod";

export const tripPickupStopSchema = z.object({
  pickup_text: z.string().min(2),
  pickup_lat: z.coerce.number().optional().nullable(),
  pickup_lng: z.coerce.number().optional().nullable(),
  passenger_name: z.string().min(1),
  passenger_phone: z.string().optional().nullable(),
  completed_at: z.string().nullable().optional()
});

export type TripPickupStop = z.infer<typeof tripPickupStopSchema>;

export const tripPickupStopsSchema = z.array(tripPickupStopSchema).min(1).max(20);

export function parseTripPickupStops(raw: unknown): TripPickupStop[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const parsed = tripPickupStopsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function hasMultiplePickupStops(stops: TripPickupStop[]): boolean {
  return stops.length > 1;
}

export function nextIncompletePickupStopIndex(stops: TripPickupStop[]): number | null {
  const idx = stops.findIndex((s) => !s.completed_at);
  return idx >= 0 ? idx : null;
}

export function allPickupStopsCompleted(stops: TripPickupStop[]): boolean {
  return stops.length > 0 && stops.every((s) => Boolean(s.completed_at));
}

export function completedPickupStopCount(stops: TripPickupStop[]): number {
  return stops.filter((s) => s.completed_at).length;
}

export function markPickupStopCompleted(
  stops: TripPickupStop[],
  stopIndex: number,
  completedAt = new Date().toISOString()
): TripPickupStop[] {
  if (stopIndex < 0 || stopIndex >= stops.length) return stops;
  const next = stops.map((s) => ({ ...s }));
  if (next[stopIndex].completed_at) return stops;
  const firstIncomplete = nextIncompletePickupStopIndex(next);
  if (firstIncomplete !== stopIndex) return stops;
  next[stopIndex] = { ...next[stopIndex], completed_at: completedAt };
  return next;
}

export function movePickupStop(stops: TripPickupStop[], from: number, to: number): TripPickupStop[] {
  if (from < 0 || from >= stops.length || to < 0 || to >= stops.length || from === to) {
    return stops;
  }
  const next = [...stops];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function pickupStopNavPoint(stop: TripPickupStop) {
  return {
    lat: stop.pickup_lat ?? null,
    lng: stop.pickup_lng ?? null,
    label: stop.pickup_text
  };
}

export function pickupStopsForStorage(stops: TripPickupStop[]): TripPickupStop[] {
  return stops.map((s) => ({
    pickup_text: s.pickup_text.trim(),
    pickup_lat: s.pickup_lat ?? null,
    pickup_lng: s.pickup_lng ?? null,
    passenger_name: s.passenger_name.trim(),
    passenger_phone: s.passenger_phone?.trim() || null,
    completed_at: s.completed_at ?? null
  }));
}
