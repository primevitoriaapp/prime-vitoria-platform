"use client";

import { useEffect, useRef } from "react";

type Point = { lat: number; lng: number; label?: string };

type Props = {
  origin: Point | null;
  destination: Point | null;
  driver: Point | null;
  height?: number;
};

export function PublicTrackMap({ origin, destination, driver, height = 280 }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    async function init() {
      if (!mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled) return;

      const map = L.map(mapRef.current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);

      const bounds: [number, number][] = [];
      const add = (p: Point | null, color: string) => {
        if (!p) return;
        const ll: [number, number] = [p.lat, p.lng];
        bounds.push(ll);
        L.circleMarker(ll, { radius: 8, color, fillColor: color, fillOpacity: 0.85 })
          .addTo(map)
          .bindPopup(p.label ?? "");
      };

      add(origin, "#f59e0b");
      add(destination, "#38bdf8");
      add(driver, "#22c55e");

      if (bounds.length >= 2) {
        map.fitBounds(bounds, { padding: [24, 24] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.setView([-20.3155, -40.3128], 11);
      }

      cleanup = () => {
        map.remove();
      };
    }

    void init();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, driver?.lat, driver?.lng]);

  const hasAny = origin || destination || driver;
  if (!hasAny) {
    return <p className="text-sm text-slate-500">Sem coordenadas para mapa; posição GPS aparece quando disponível.</p>;
  }

  return <div ref={mapRef} className="w-full overflow-hidden rounded-xl border border-slate-800" style={{ height }} />;
}
