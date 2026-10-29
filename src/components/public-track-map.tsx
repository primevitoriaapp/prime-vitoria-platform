"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

type Point = { lat: number; lng: number; label?: string };

type Props = {
  origin: Point | null;
  destination: Point | null;
  driver: Point | null;
  height?: number | string;
};

const pin = (bg: string, inner: string, size = 30) =>
  `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px system-ui">${inner}</div>`;

/** Mapa do acompanhamento: cria uma vez e só move os marcadores (sem piscar a cada atualização). */
export function PublicTrackMap({ origin, destination, driver, height = 300 }: Props) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const marks = useRef<{ o?: Marker; d?: Marker; c?: Marker }>({});
  const fitted = useRef(false);

  useEffect(() => {
    let off = false;
    void (async () => {
      const L = await import("leaflet");
      if (off || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: false, attributionControl: true });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          maxZoom: 19
        }).addTo(map.current);
        L.control.zoom({ position: "bottomright" }).addTo(map.current);
      }
      const m = map.current;
      const put = (key: "o" | "d" | "c", p: Point | null, html: string, size: number) => {
        const cur = marks.current[key];
        if (!p) {
          cur?.remove();
          marks.current[key] = undefined;
          return;
        }
        if (cur) cur.setLatLng([p.lat, p.lng]);
        else
          marks.current[key] = L.marker([p.lat, p.lng], {
            icon: L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
            zIndexOffset: key === "c" ? 1000 : 0
          }).addTo(m);
      };
      put("o", origin, pin("#111", "A"), 30);
      put("d", destination, pin("#7A6A3A", "B"), 30);
      put("c", driver, pin("#C9A84C", "🚘", 38), 38);

      const pts = [driver, origin, destination].filter(Boolean) as Point[];
      if (!fitted.current || driver) {
        if (driver && origin) m.fitBounds([[driver.lat, driver.lng], [origin.lat, origin.lng]], { padding: [40, 40], maxZoom: 16 });
        else if (pts.length >= 2) m.fitBounds(pts.map((p) => [p.lat, p.lng] as [number, number]), { padding: [40, 40], maxZoom: 15 });
        else if (pts.length === 1) m.setView([pts[0].lat, pts[0].lng], 15);
        else m.setView([-20.3155, -40.3128], 12);
        fitted.current = true;
      }
    })();
    return () => {
      off = true;
    };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, driver?.lat, driver?.lng, origin, destination, driver]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    []
  );

  return <div ref={el} className="w-full overflow-hidden" style={{ height }} />;
}
