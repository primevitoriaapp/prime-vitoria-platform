export function publicTrackNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function publicTrackPoint(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const parsedLat = publicTrackNumber(lat);
  const parsedLng = publicTrackNumber(lng);
  if (parsedLat == null || parsedLng == null) return null;
  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return null;
  return { lat: parsedLat, lng: parsedLng };
}
