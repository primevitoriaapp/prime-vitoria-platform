"use client";

import { useEffect, useRef } from "react";

export function LiveMap() {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cleanup = () => {};

    async function boot() {
      if (!mapRef.current) return;
      const L = await import("leaflet");
      const map = L.map(mapRef.current).setView([-20.2976, -40.2958], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      L.marker([-20.3155, -40.3128]).addTo(map).bindPopup("Motorista ativo");
      cleanup = () => map.remove();
    }

    void boot();
    return () => cleanup();
  }, []);

  return <div className="card" ref={mapRef} style={{ height: 360 }} />;
}
