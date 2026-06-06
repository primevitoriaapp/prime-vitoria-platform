import { db } from "@/lib/server/db";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { shortPlaceLabel } from "@/lib/trips/format-place-label";

export type DriverPayableTripDetail = {
  scheduled_at: string | null;
  scheduled_label: string | null;
  origin_text: string | null;
  destination_text: string | null;
  route_label: string | null;
  passenger_name: string | null;
  planned_km: number | null;
  actual_km: number | null;
  wait_minutes: number | null;
  started_at: string | null;
  started_label: string | null;
  completed_at: string | null;
  completed_label: string | null;
};

type PayableRow = { trip_id: string };

export async function enrichDriverPayablesWithTrips<T extends PayableRow>(
  rows: T[]
): Promise<Array<T & { trip: DriverPayableTripDetail | null }>> {
  const tripIds = [...new Set(rows.map((row) => row.trip_id).filter(Boolean))];
  if (tripIds.length === 0) {
    return rows.map((row) => ({ ...row, trip: null }));
  }

  const [{ data: trips }, { data: history }] = await Promise.all([
    db
      .from("trips")
      .select(
        "id, scheduled_at, origin_text, destination_text, passenger_name, planned_km, actual_km, wait_minutes"
      )
      .in("id", tripIds),
    db
      .from("trip_status_history")
      .select("trip_id, to_status, changed_at")
      .in("trip_id", tripIds)
      .in("to_status", ["in_progress", "completed"])
      .order("changed_at", { ascending: true })
  ]);

  const tripMap = new Map((trips ?? []).map((trip) => [trip.id as string, trip]));
  const startedAt = new Map<string, string>();
  const completedAt = new Map<string, string>();
  for (const row of history ?? []) {
    const tripId = row.trip_id as string;
    const status = row.to_status as string;
    const changedAt = row.changed_at as string;
    if (status === "in_progress" && !startedAt.has(tripId)) startedAt.set(tripId, changedAt);
    if (status === "completed") completedAt.set(tripId, changedAt);
  }

  return rows.map((row) => {
    const trip = tripMap.get(row.trip_id);
    if (!trip) return { ...row, trip: null };

    const started = startedAt.get(row.trip_id) ?? null;
    const completed = completedAt.get(row.trip_id) ?? null;
    const origin = shortPlaceLabel(String(trip.origin_text ?? ""));
    const destination = shortPlaceLabel(String(trip.destination_text ?? ""));

    return {
      ...row,
      trip: {
        scheduled_at: (trip.scheduled_at as string) ?? null,
        scheduled_label: trip.scheduled_at ? formatBrDateTime(trip.scheduled_at as string) : null,
        origin_text: (trip.origin_text as string) ?? null,
        destination_text: (trip.destination_text as string) ?? null,
        route_label: origin && destination ? `${origin} → ${destination}` : origin || destination || null,
        passenger_name: (trip.passenger_name as string) ?? null,
        planned_km: trip.planned_km != null ? Number(trip.planned_km) : null,
        actual_km: trip.actual_km != null ? Number(trip.actual_km) : null,
        wait_minutes: trip.wait_minutes != null ? Number(trip.wait_minutes) : null,
        started_at: started,
        started_label: started ? formatBrDateTime(started) : null,
        completed_at: completed,
        completed_label: completed ? formatBrDateTime(completed) : null
      }
    };
  });
}
