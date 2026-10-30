/** Confere se o motorista está no local certo para mudar a etapa da corrida (funções puras). */

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Raio aceito: 400 m (+ até 200 m da imprecisão do GPS do celular). */
export const GEOFENCE_BASE_M = 400;

export type GeofenceTarget = "embarque" | "destino";

export function geofenceCheck(
  position: { lat: number; lng: number; accuracy?: number | null } | null,
  target: { lat: number | null; lng: number | null } | null
): { ok: true; distance: number | null; skipped?: boolean } | { ok: false; reason: "sem_gps" | "longe"; distance: number | null } {
  if (!target || target.lat == null || target.lng == null) return { ok: true, distance: null, skipped: true };
  if (!position) return { ok: false, reason: "sem_gps", distance: null };
  const d = distanceMeters(position, { lat: target.lat, lng: target.lng });
  const allowed = GEOFENCE_BASE_M + Math.min(200, Math.max(0, position.accuracy ?? 0));
  return d <= allowed ? { ok: true, distance: d } : { ok: false, reason: "longe", distance: d };
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${m} m`;
}
