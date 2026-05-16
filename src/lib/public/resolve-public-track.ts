import { db } from "@/lib/server/db";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { normalizePublicTrackToken } from "./track-token";

export type PublicTrackSnapshot = {
  trip_id: string;
  operational_status: TripOperationalStatus;
  origin_text: string;
  destination_text: string;
  passenger_name: string | null;
  scheduled_at: string;
  location: { lat: number; lng: number; recorded_at: string } | null;
  origin_coords: { lat: number; lng: number } | null;
  destination_coords: { lat: number; lng: number } | null;
  planned_km: number | null;
  actual_km: number | null;
  /** Preenchido quando a viagem tem coluna `km_updated_at` (recálculo pós-corrida ou manual). */
  km_updated_at: string | null;
  expires_at: string;
};

export async function resolvePublicTrackSnapshot(rawToken: string): Promise<PublicTrackSnapshot | null> {
  const token = normalizePublicTrackToken(rawToken);
  if (!token) return null;

  const now = new Date().toISOString();
  const { data: row } = await db
    .from("trip_public_track_tokens")
    .select("trip_id, expires_at")
    .eq("token", token)
    .gt("expires_at", now)
    .maybeSingle();

  if (!row?.trip_id) return null;

  const { data: trip } = await db
    .from("trips")
    .select(
      "operational_status, origin_text, destination_text, passenger_name, scheduled_at, planned_km, actual_km, km_updated_at, origin_lat, origin_lng, destination_lat, destination_lng"
    )
    .eq("id", row.trip_id)
    .maybeSingle();

  if (!trip) return null;

  const { data: loc } = await db
    .from("driver_locations")
    .select("lat, lng, recorded_at")
    .eq("trip_id", row.trip_id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    trip_id: row.trip_id,
    operational_status: trip.operational_status as TripOperationalStatus,
    origin_text: trip.origin_text,
    destination_text: trip.destination_text,
    passenger_name: (trip.passenger_name as string | null) ?? null,
    scheduled_at: trip.scheduled_at,
    location: loc
      ? {
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          recorded_at: loc.recorded_at as string
        }
      : null,
    origin_coords:
      trip.origin_lat != null && trip.origin_lng != null
        ? { lat: Number(trip.origin_lat), lng: Number(trip.origin_lng) }
        : null,
    destination_coords:
      trip.destination_lat != null && trip.destination_lng != null
        ? { lat: Number(trip.destination_lat), lng: Number(trip.destination_lng) }
        : null,
    planned_km: trip.planned_km != null ? Number(trip.planned_km) : null,
    actual_km: trip.actual_km != null ? Number(trip.actual_km) : null,
    km_updated_at: (trip.km_updated_at as string | null) ?? null,
    expires_at: row.expires_at as string
  };
}
