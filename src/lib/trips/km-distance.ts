/** Distância em km (haversine) entre dois pontos WGS84. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(r * c * 100) / 100;
}

export type TripCoords = {
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
};

export function plannedKmFromCoords(trip: TripCoords): number | null {
  const { origin_lat: oLat, origin_lng: oLng, destination_lat: dLat, destination_lng: dLng } = trip;
  if (oLat == null || oLng == null || dLat == null || dLng == null) return null;
  return haversineKm(Number(oLat), Number(oLng), Number(dLat), Number(dLng));
}

export type GpsPoint = { lat: number; lng: number; recorded_at: string };

/** Soma segmentos consecutivos do trail GPS (km). */
export function actualKmFromTrail(points: GpsPoint[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    total += haversineKm(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
  }
  return Math.round(total * 100) / 100;
}
