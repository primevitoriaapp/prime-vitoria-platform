export type NavPoint = {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
};

export function buildGoogleMapsDirectionsUrl(point: NavPoint): string {
  if (point.lat != null && point.lng != null && !Number.isNaN(point.lat) && !Number.isNaN(point.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
  }
  const q = (point.label ?? "").trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || "destino")}`;
}

export function buildWazeNavigateUrl(point: NavPoint): string | null {
  if (point.lat == null || point.lng == null || Number.isNaN(point.lat) || Number.isNaN(point.lng)) {
    return null;
  }
  return `waze://?ll=${point.lat},${point.lng}&navigate=yes`;
}
