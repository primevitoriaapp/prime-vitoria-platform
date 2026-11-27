"use client";

import { loadGoogle } from "@/lib/maps/google-maps";
import { haversineKm } from "@/lib/trips/km-distance";

export type LatLng = { lat: number; lng: number };
export type RouteKmResult = { km: number; source: "google" | "linha_reta" };

/**
 * Distância de carro pela rota (saída → paradas → destino), em km.
 * Usa o Google (Directions; se não estiver liberado, Routes). Sem Google: linha reta × 1,3 (estimativa).
 */
export async function routeKm(points: LatLng[]): Promise<RouteKmResult | null> {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 2) return null;
  const origin = pts[0];
  const destination = pts[pts.length - 1];
  const middle = pts.slice(1, -1);
  try {
    const g = await loadGoogle();
    try {
      const svc = new g.maps.DirectionsService();
      const res = await svc.route({
        origin,
        destination,
        waypoints: middle.map((location) => ({ location, stopover: true })),
        travelMode: g.maps.TravelMode.DRIVING,
        region: "BR"
      });
      const meters = (res?.routes?.[0]?.legs ?? []).reduce((s: number, l: { distance?: { value?: number } }) => s + (l.distance?.value ?? 0), 0);
      if (meters > 0) return { km: Math.round(meters / 100) / 10, source: "google" };
    } catch {
      /* tenta a API nova abaixo */
    }
    try {
      const { Route } = await g.maps.importLibrary("routes");
      const { routes } = await Route.computeRoutes({
        origin,
        destination,
        intermediates: middle.map((location) => ({ location })),
        travelMode: "DRIVING",
        fields: ["distanceMeters"]
      });
      const meters = Number(routes?.[0]?.distanceMeters ?? 0);
      if (meters > 0) return { km: Math.round(meters / 100) / 10, source: "google" };
    } catch {
      /* cai na estimativa */
    }
  } catch {
    /* Google não carregou */
  }
  let straight = 0;
  for (let i = 1; i < pts.length; i++) straight += haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
  return straight > 0 ? { km: Math.round(straight * 1.3 * 10) / 10, source: "linha_reta" } : null;
}
