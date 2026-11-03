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
 * Regra de cobrança (definida por Rubens em 03/11/2026):
 * GPS quando ele mediu o trajeto inteiro; KM do painel quando o GPS teve buracos e o painel deu mais.
 * Painel absurdamente acima do GPS (mais que o dobro + 5 km) não é aceito sozinho: fica o GPS e a central confere.
 */
export function chooseBillableKm(input: {
  gpsKm: number | null;
  gpsGapKm: number;
  gpsGaps: number;
  odometerKm: number | null;
  fromGps: boolean;
}): BillableKmChoice {
  const { gpsKm, gpsGapKm, gpsGaps, odometerKm, fromGps } = input;
  if (gpsKm == null || gpsKm <= 0) {
    return odometerKm != null ? { km: odometerKm, source: "odometer", note: null } : { km: null, source: "manual", note: null };
  }
  if (!fromGps) return { km: gpsKm, source: "manual", note: null };
  if (odometerKm == null) return { km: gpsKm, source: "gps_trail", note: null };
  const unreliable = gpsGaps > 0 && gpsGapKm >= Math.max(1, gpsKm * 0.15);
  if (!unreliable || odometerKm <= gpsKm) return { km: gpsKm, source: "gps_trail", note: null };
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (odometerKm > gpsKm * 2 + 5) {
    return {
      km: gpsKm,
      source: "gps_trail",
      note: `GPS perdeu sinal (${gpsGaps} trechos) e o painel deu ${fmt(odometerKm)} km contra ${fmt(gpsKm)} km do GPS — diferença grande demais, conferir antes de faturar`
    };
  }
  return {
    km: odometerKm,
    source: "odometer",
    note: `GPS perdeu sinal em ${gpsGaps} trechos (${fmt(gpsGapKm)} km em linha reta); cobrado pelo painel do carro: ${fmt(odometerKm)} km (GPS mediu ${fmt(gpsKm)} km)`
  };
}
