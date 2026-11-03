"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";

type Point = { lat: number; lng: number };

const dot = (bg: string, inner: string, size: number, ring = "#fff") =>
  `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid ${ring};box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px system-ui">${inner}</div>`;

/** Mapa do início do app (estilo Uber): onde o motorista está e o embarque da próxima corrida. */
export function DriverHomeMap({ pickup, dropoff, height }: { pickup: Point | null; dropoff: Point | null; height: string }) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const marks = useRef<{ me?: Marker; a?: Marker; b?: Marker; line?: Polyline }>({});
  const [me, setMe] = useState<Point | null>(null);
  const fitted = useRef("");

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    let off = false;
    void (async () => {
      const L = await import("leaflet");
      if (off || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: false, attributionControl: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 })
          .on("tileerror", () => undefined)
          .addTo(map.current);
        map.current.setView([-20.3155, -40.3128], 12);
      }
      const m = map.current;
      const put = (key: "me" | "a" | "b", p: Point | null, html: string, size: number) => {
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
            zIndexOffset: key === "me" ? 1000 : 0
          }).addTo(m);
      };
      put("me", me, dot("#2563EB", "", 22), 22);
      put("a", pickup, dot("#111", "A", 30, "#C9A84C"), 30);
      put("b", dropoff, dot("#C9A84C", "B", 26), 26);
      marks.current.line?.remove();
      marks.current.line = pickup && dropoff ? L.polyline([[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]], { color: "#111", weight: 3, opacity: 0.55, dashArray: "6 8" }).addTo(m) : undefined;

      const pts = [me, pickup, dropoff].filter(Boolean) as Point[];
      const key = pts.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join("|");
      if (key !== fitted.current) {
        fitted.current = key;
        if (pts.length >= 2) m.fitBounds(pts.map((p) => [p.lat, p.lng] as [number, number]), { paddingTopLeft: [40, 90], paddingBottomRight: [40, 60], maxZoom: 15 });
        else if (pts.length === 1) m.setView([pts[0].lat, pts[0].lng], 15);
      }
    })();
    return () => {
      off = true;
    };
  }, [me, pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, pickup, dropoff]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    []
  );

  return <div ref={el} className="w-full bg-[#E9E6DF]" style={{ height }} />;
}
