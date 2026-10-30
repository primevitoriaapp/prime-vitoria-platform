import { db } from "@/lib/server/db";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { normalizePublicTrackToken } from "./track-token";
import { publicTrackNumber, publicTrackPoint } from "./public-track-values";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";

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
  /** Para o passageiro reconhecer o carro: só o primeiro nome do motorista. */
  driver: { first_name: string; photo_url: string | null } | null;
  vehicle: { label: string; color: string | null; plate: string | null } | null;
  category: string | null;
  central_phone: string | null;
  rated: boolean;
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
      "tenant_id, driver_id, vehicle_id, vehicle_category_id, operational_status, origin_text, destination_text, passenger_name, scheduled_at, planned_km, actual_km, km_updated_at, origin_lat, origin_lng, destination_lat, destination_lng"
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

  const locationPoint = publicTrackPoint(loc?.lat, loc?.lng);

  const [drv, veh, cat, company] = await Promise.all([
    trip.driver_id ? db.from("drivers").select("full_name, photo_url").eq("id", trip.driver_id).maybeSingle() : Promise.resolve({ data: null }),
    trip.vehicle_id ? db.from("vehicles").select("brand, model, color, plate").eq("id", trip.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
    trip.vehicle_category_id ? db.from("vehicle_categories").select("name").eq("id", trip.vehicle_category_id).maybeSingle() : Promise.resolve({ data: null }),
    getTenantCompanyProfile(trip.tenant_id as string).catch(() => null)
  ]);
  const d = drv.data as { full_name?: string | null; photo_url?: string | null } | null;
  const v = veh.data as { brand?: string | null; model?: string | null; color?: string | null; plate?: string | null } | null;

  return {
    trip_id: row.trip_id,
    operational_status: trip.operational_status as TripOperationalStatus,
    origin_text: trip.origin_text,
    destination_text: trip.destination_text,
    passenger_name: (trip.passenger_name as string | null) ?? null,
    scheduled_at: trip.scheduled_at,
    // Terminou: não mostra mais onde o carro está.
    location: locationPoint && !["completed", "cancelled", "rejected", "no_show"].includes(trip.operational_status as string)
      ? {
          ...locationPoint,
          recorded_at: loc?.recorded_at as string
        }
      : null,
    origin_coords: publicTrackPoint(trip.origin_lat, trip.origin_lng),
    destination_coords: publicTrackPoint(trip.destination_lat, trip.destination_lng),
    planned_km: publicTrackNumber(trip.planned_km),
    actual_km: publicTrackNumber(trip.actual_km),
    km_updated_at: (trip.km_updated_at as string | null) ?? null,
    expires_at: row.expires_at as string,
    driver: d?.full_name ? { first_name: d.full_name.trim().split(/\s+/)[0], photo_url: d.photo_url ?? null } : null,
    vehicle: v ? { label: [v.brand, v.model].filter(Boolean).join(" ") || "Veículo", color: v.color ?? null, plate: v.plate ?? null } : null,
    category: ((cat.data as { name?: string } | null)?.name as string | undefined) ?? null,
    central_phone: company?.phone || null,
    rated: await db
      .from("trip_ratings")
      .select("id")
      .eq("trip_id", row.trip_id)
      .maybeSingle()
      .then((r) => Boolean(r.data))
  };
}
