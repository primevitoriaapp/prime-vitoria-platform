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

function validLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function plannedKmFromCoords(trip: TripCoords): number | null {
  const { origin_lat: oLat, origin_lng: oLng, destination_lat: dLat, destination_lng: dLng } = trip;
  if (oLat == null || oLng == null || dLat == null || dLng == null) return null;
  const originLat = Number(oLat);
  const originLng = Number(oLng);
  const destinationLat = Number(dLat);
  const destinationLng = Number(dLng);
  if (!validLatLng(originLat, originLng) || !validLatLng(destinationLat, destinationLng)) return null;
  return haversineKm(originLat, originLng, destinationLat, destinationLng);
}

export type GpsPoint = { lat: number; lng: number; recorded_at: string };

function validPoint(point: GpsPoint): boolean {
  return (
    validLatLng(point.lat, point.lng) &&
    Number.isFinite(Date.parse(point.recorded_at))
  );
}

/** Soma segmentos consecutivos do trail GPS (km), ignorando pontos inválidos e saltos prováveis de GPS ruim. */
export function actualKmFromTrail(points: GpsPoint[], opts?: { maxSegmentKm?: number }): number | null {
  const maxSegmentKm = opts?.maxSegmentKm ?? 25;
  const sorted = points.filter(validPoint).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  if (sorted.length < 2) return null;
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const segment = haversineKm(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
    if (segment <= maxSegmentKm) total += segment;
  }
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

/** Quanto do trajeto GPS foi "chutado" em linha reta porque o celular parou de mandar posição (app fechado/tela apagada). */
export function gpsTrailGaps(points: GpsPoint[], gapSeconds = 60): { totalKm: number; gapKm: number; gaps: number } {
  const sorted = points.filter(validPoint).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  let totalKm = 0;
  let gapKm = 0;
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const seg = haversineKm(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
    totalKm += seg;
    const secs = (Date.parse(sorted[i].recorded_at) - Date.parse(sorted[i - 1].recorded_at)) / 1000;
    if (secs > gapSeconds) {
      gaps++;
      gapKm += seg;
    }
  }
  return { totalKm: Math.round(totalKm * 100) / 100, gapKm: Math.round(gapKm * 100) / 100, gaps };
}

export type BillableKmChoice = { km: number | null; source: "gps_trail" | "odometer" | "manual"; note: string | null };

/**
 * Regra de cobrança (Rubens, 05/11/2026): enquanto o GPS do app não é confiável, vale o KM do PAINEL
 * informado pelo motorista (KM final − KM inicial). Sem painel, vale o GPS.
 * Painel e GPS muito diferentes (mais de 20% e mais de 3 km) → cobra o painel, mas a central confere.
 */
export function chooseBillableKm(input: {
  gpsKm: number | null;
  gpsGapKm: number;
  gpsGaps: number;
  odometerKm: number | null;
  fromGps: boolean;
}): BillableKmChoice {
  const { gpsKm, odometerKm, fromGps } = input;
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (odometerKm != null && odometerKm > 0) {
    const hasGps = gpsKm != null && gpsKm > 0 && fromGps;
    const diff = hasGps ? Math.abs(odometerKm - (gpsKm as number)) : 0;
    const far = hasGps && diff > 3 && diff > (gpsKm as number) * 0.2;
    return {
      km: odometerKm,
      source: "odometer",
      note: far ? `painel do motorista deu ${fmt(odometerKm)} km e o GPS ${fmt(gpsKm as number)} km — cobrado pelo painel, conferir` : null
    };
  }
  if (gpsKm == null || gpsKm <= 0) return { km: null, source: "manual", note: null };
  return { km: gpsKm, source: fromGps ? "gps_trail" : "manual", note: null };
}
