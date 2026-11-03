"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import { CLEAN_STYLE, GOOGLE_KEY, VITORIA, loadGoogle } from "@/lib/maps/google-maps";

type Point = { lat: number; lng: number; label?: string };

type Props = {
  origin: Point | null;
  destination: Point | null;
  driver: Point | null;
  /** Caminho já percorrido pelo carro (mais antigo → mais novo). */
  trail?: { lat: number; lng: number }[];
  height?: number | string;
};

/** Mapa do acompanhamento do passageiro: estilo limpo (Google), carro ao vivo e o caminho que ele fez. */
export function PublicTrackMap(props: Props) {
  const [engine, setEngine] = useState<"google" | "leaflet">(GOOGLE_KEY ? "google" : "leaflet");
  return engine === "google" ? <GoogleTrack {...props} onFail={() => setEngine("leaflet")} /> : <LeafletTrack {...props} />;
}

const CAR_PATH = "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z";

function GoogleTrack({ origin, destination, driver, trail = [], height = 300, onFail }: Props & { onFail: () => void }) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const marks = useRef<{ o?: any; d?: any; c?: any; halo?: any; line?: any }>({});
  const userMoved = useRef(false);
  const fittedKey = useRef("");

  useEffect(() => {
    let off = false;
    loadGoogle()
      .then((google) => {
        if (off || !el.current || map.current) return;
        map.current = new google.maps.Map(el.current, {
          center: VITORIA,
          zoom: 13,
          styles: CLEAN_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: "#ECEAE4"
        });
        map.current.addListener("dragstart", () => (userMoved.current = true));
        draw();
      })
      .catch(() => !off && onFail());
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const g = (window as any).google;
    const m = map.current;
    if (!g || !m) return;
    try {
      const pin = (key: "o" | "d", p: Point | null, label: string, fill: string) => {
        if (!p) return;
        if (!marks.current[key])
          marks.current[key] = new g.maps.Marker({
            map: m,
            clickable: false,
            label: { text: label, color: "#fff", fontWeight: "700", fontSize: "12px" },
            icon: { path: g.maps.SymbolPath.CIRCLE, scale: 12, fillColor: fill, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 }
          });
        marks.current[key].setPosition(p);
      };
      pin("o", origin, "A", "#111111");
      pin("d", destination, "B", "#7A6A3A");

      const path = [...trail];
      if (driver && (!path.length || path[path.length - 1].lat !== driver.lat || path[path.length - 1].lng !== driver.lng)) path.push(driver);
      if (path.length >= 2) {
        if (!marks.current.line)
          marks.current.line = new g.maps.Polyline({ map: m, clickable: false, strokeColor: "#C9A84C", strokeOpacity: 0.95, strokeWeight: 5 });
        marks.current.line.setPath(path);
      }

      if (driver) {
        if (!marks.current.c) {
          marks.current.halo = new g.maps.Marker({ map: m, clickable: false, zIndex: 9, icon: { path: g.maps.SymbolPath.CIRCLE, scale: 24, fillColor: "#C9A84C", fillOpacity: 0.2, strokeWeight: 0 } });
          marks.current.c = new g.maps.Marker({
            map: m,
            clickable: false,
            zIndex: 10,
            icon: { path: CAR_PATH, fillColor: "#111111", fillOpacity: 1, strokeColor: "#C9A84C", strokeWeight: 1.5, scale: 1.6, anchor: new g.maps.Point(12, 12) }
          });
        }
        marks.current.c.setPosition(driver);
        marks.current.halo.setPosition(driver);
      }

      // Enquadra o carro e o próximo ponto (embarque antes de pegar o passageiro).
      const key = `${driver ? `${driver.lat.toFixed(3)},${driver.lng.toFixed(3)}` : ""}|${origin?.lat}|${destination?.lat}`;
      if (!userMoved.current && key !== fittedKey.current) {
        fittedKey.current = key;
        const pts = [driver, origin, destination].filter(Boolean) as Point[];
        if (pts.length >= 2) {
          const b = new g.maps.LatLngBounds();
          for (const p of driver && origin ? [driver, origin] : pts) b.extend(p);
          m.fitBounds(b, 50);
          if (m.getZoom() > 16) m.setZoom(16);
        } else if (pts.length === 1) {
          m.setCenter(pts[0]);
          m.setZoom(15);
        }
      }
    } catch {
      /* mapa é enfeite */
    }
  }

  useEffect(draw);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={el} className="absolute inset-0" />
      {driver ? (
        <button
          type="button"
          onClick={() => {
            userMoved.current = false;
            fittedKey.current = "";
            draw();
          }}
          className="absolute bottom-3 left-3 z-[1] rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#111] shadow"
        >
          Ver o carro
        </button>
      ) : null}
    </div>
  );
}

const pinHtml = (bg: string, inner: string, size = 30) =>
  `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px system-ui">${inner}</div>`;

/** Reserva (sem Google): mapa aberto em tons de cinza. */
function LeafletTrack({ origin, destination, driver, trail = [], height = 300 }: Props) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const marks = useRef<{ o?: Marker; d?: Marker; c?: Marker; line?: Polyline }>({});
  const fitted = useRef(false);

  useEffect(() => {
    let off = false;
    void (async () => {
      const L = await import("leaflet");
      if (off || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: false, attributionControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19, className: "pv-clean-tiles" }).addTo(map.current);
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
      put("o", origin, pinHtml("#111", "A"), 30);
      put("d", destination, pinHtml("#7A6A3A", "B"), 30);
      put("c", driver, pinHtml("#111", "🚘", 38), 38);
      const path = [...trail, ...(driver ? [driver] : [])].map((p) => [p.lat, p.lng] as [number, number]);
      if (path.length >= 2) {
        if (!marks.current.line) marks.current.line = L.polyline(path, { color: "#C9A84C", weight: 5, opacity: 0.95 }).addTo(m);
        else marks.current.line.setLatLngs(path);
      }
      const pts = [driver, origin, destination].filter(Boolean) as Point[];
      if (!fitted.current || driver) {
        if (driver && origin) m.fitBounds([[driver.lat, driver.lng], [origin.lat, origin.lng]], { padding: [40, 40], maxZoom: 16 });
        else if (pts.length >= 2) m.fitBounds(pts.map((p) => [p.lat, p.lng] as [number, number]), { padding: [40, 40], maxZoom: 15 });
        else if (pts.length === 1) m.setView([pts[0].lat, pts[0].lng], 15);
        else m.setView([VITORIA.lat, VITORIA.lng], 12);
        fitted.current = true;
      }
    })();
    return () => {
      off = true;
    };
  }, [origin, destination, driver, trail]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    []
  );

  return <div ref={el} className="w-full overflow-hidden" style={{ height }} />;
}
