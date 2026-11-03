"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { CLEAN_STYLE, GOOGLE_KEY, VITORIA, loadGoogle } from "@/lib/maps/google-maps";

type Point = { lat: number; lng: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Se o mapa falhar, mostra só um fundo neutro (o app continua funcionando). */
export class MapSafe extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div className="h-full w-full bg-[#ECEAE4]" /> : this.props.children;
  }
}

/** Posição do celular do motorista (atualiza sozinha). */
function useMyPosition(): Point | null {
  const [me, setMe] = useState<Point | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return me;
}

/** Mapa do início do app: onde o motorista está e, se houver corrida, o ponto de embarque. */
export function DriverHomeMap({ pickup }: { pickup: Point | null }) {
  const me = useMyPosition();
  const [engine, setEngine] = useState<"google" | "leaflet">(GOOGLE_KEY ? "google" : "leaflet");
  return (
    <div className="relative h-full w-full bg-[#ECEAE4]">
      {engine === "google" ? <GoogleLayer me={me} pickup={pickup} onFail={() => setEngine("leaflet")} /> : <LeafletLayer me={me} pickup={pickup} />}
      {!me ? (
        <p className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-[#6F6A60] shadow">Procurando sua localização…</p>
      ) : null}
    </div>
  );
}

function GoogleLayer({ me, pickup, onFail }: { me: Point | null; pickup: Point | null; onFail: () => void }) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const marks = useRef<{ me?: any; halo?: any; pick?: any }>({});
  const fitted = useRef("");

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
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: "#ECEAE4"
        });
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
      if (me) {
        if (!marks.current.me) {
          marks.current.halo = new g.maps.Marker({ map: m, clickable: false, icon: { path: g.maps.SymbolPath.CIRCLE, scale: 22, fillColor: "#2563EB", fillOpacity: 0.15, strokeWeight: 0 } });
          marks.current.me = new g.maps.Marker({ map: m, clickable: false, zIndex: 10, icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#2563EB", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } });
        }
        marks.current.me.setPosition(me);
        marks.current.halo.setPosition(me);
      }
      if (pickup) {
        if (!marks.current.pick)
          marks.current.pick = new g.maps.Marker({
            map: m,
            clickable: false,
            zIndex: 5,
            icon: { path: "M12 2C8 2 5 5 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-4-3-7-7-7z", fillColor: "#111111", fillOpacity: 1, strokeColor: "#C9A84C", strokeWeight: 2, scale: 1.8, anchor: new g.maps.Point(12, 22) }
          });
        marks.current.pick.setPosition(pickup);
      } else if (marks.current.pick) {
        marks.current.pick.setMap(null);
        marks.current.pick = undefined;
      }
      const key = `${me ? `${me.lat.toFixed(3)},${me.lng.toFixed(3)}` : ""}|${pickup ? `${pickup.lat},${pickup.lng}` : ""}`;
      if (key !== fitted.current) {
        fitted.current = key;
        if (me && pickup) {
          const b = new g.maps.LatLngBounds();
          b.extend(me);
          b.extend(pickup);
          m.fitBounds(b, { top: 110, left: 50, right: 50, bottom: 300 });
        } else if (me) {
          m.setCenter(me);
          m.setZoom(15);
        } else if (pickup) {
          m.setCenter(pickup);
          m.setZoom(14);
        }
      }
    } catch {
      /* mapa é enfeite */
    }
  }

  useEffect(draw);

  return <div ref={el} className="absolute inset-0" />;
}

function LeafletLayer({ me, pickup }: { me: Point | null; pickup: Point | null }) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const marks = useRef<{ me?: import("leaflet").Marker; pick?: import("leaflet").Marker }>({});
  const fitted = useRef("");

  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const L = await import("leaflet");
        if (off || !el.current) return;
        if (!map.current) {
          map.current = L.map(el.current, { zoomControl: false, attributionControl: false });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, className: "pv-clean-tiles" }).addTo(map.current);
          map.current.setView([VITORIA.lat, VITORIA.lng], 13);
        }
        const m = map.current;
        const html = (bg: string, size: number) =>
          `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 0 0 10px rgba(37,99,235,.15),0 2px 6px rgba(0,0,0,.3)"></div>`;
        if (me) {
          if (!marks.current.me) marks.current.me = L.marker([me.lat, me.lng], { icon: L.divIcon({ html: html("#2563EB", 18), className: "", iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(m);
          else marks.current.me.setLatLng([me.lat, me.lng]);
        }
        if (pickup) {
          const pin = `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#111;border:2px solid #C9A84C"></div>`;
          if (!marks.current.pick) marks.current.pick = L.marker([pickup.lat, pickup.lng], { icon: L.divIcon({ html: pin, className: "", iconSize: [28, 28], iconAnchor: [14, 28] }) }).addTo(m);
          else marks.current.pick.setLatLng([pickup.lat, pickup.lng]);
        } else if (marks.current.pick) {
          marks.current.pick.remove();
          marks.current.pick = undefined;
        }
        const key = `${me ? `${me.lat.toFixed(3)},${me.lng.toFixed(3)}` : ""}|${pickup ? `${pickup.lat},${pickup.lng}` : ""}`;
        if (key !== fitted.current) {
          fitted.current = key;
          if (me && pickup) m.fitBounds([[me.lat, me.lng], [pickup.lat, pickup.lng]], { paddingTopLeft: [50, 110], paddingBottomRight: [50, 300], maxZoom: 15 });
          else if (me) m.setView([me.lat, me.lng], 15);
          else if (pickup) m.setView([pickup.lat, pickup.lng], 14);
        }
      } catch {
        /* mapa é enfeite */
      }
    })();
    return () => {
      off = true;
    };
  }, [me, pickup]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    []
  );

  return <div ref={el} className="absolute inset-0" />;
}
