"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FLEET_STATUS, type FleetStatus } from "@/lib/drivers/fleet-status";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type FleetItem = {
  id: string;
  name: string | null;
  phone: string | null;
  status: FleetStatus;
  location: { lat: number; lng: number; recorded_at: string } | null;
  next_trip: { id: string; scheduled_at: string; passenger: string | null; origin: string | null; status: string } | null;
};

type Props = { tenantId: string | null };

const ORDER: FleetStatus[] = ["ocupado", "deslocando", "proximo", "livre", "offline"];

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() || "";

/* eslint-disable @typescript-eslint/no-explicit-any */
let googleLoader: Promise<any> | null = null;
function loadGoogleMaps(key: string): Promise<any> {
  const w = window as unknown as { google?: any };
  if (w.google?.maps) return Promise.resolve(w.google);
  if (googleLoader) return googleLoader;
  googleLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=pt-BR&region=BR`;
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: any }).google);
    script.onerror = () => {
      googleLoader = null;
      reject(new Error("Google Maps não carregou"));
    };
    document.head.appendChild(script);
  });
  return googleLoader;
}

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.round(min / 60)} h`;
}

/** Mapa da central: cada motorista com a cor da situação (livre, ocupado, deslocando, corrida em breve). */
export function LiveMap({ tenantId }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [items, setItems] = useState<FleetItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/operations/fleet-map", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { items: FleetItem[] } };
    if (res.ok && json.success && json.data) {
      setItems(json.data.items);
      setError(null);
    } else {
      setError("Não foi possível carregar os motoristas.");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  useTenantTableRefresh(tenantId, ["driver_locations", "drivers", "trips"], load, 1500);

  const googleMapRef = useRef<any>(null);
  const googleMarkersRef = useRef<any[]>([]);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const useGoogle = Boolean(GOOGLE_KEY) && !googleFailed;

  // Mapa do Google (quando a chave existe).
  useEffect(() => {
    if (!useGoogle || !mapEl.current || googleMapRef.current) return;
    let cancelled = false;
    loadGoogleMaps(GOOGLE_KEY)
      .then((google) => {
        if (cancelled || !mapEl.current) return;
        googleMapRef.current = new google.maps.Map(mapEl.current, {
          center: { lat: -20.2976, lng: -40.2958 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true
        });
        setGoogleReady(true);
      })
      .catch(() => setGoogleFailed(true));
    return () => {
      cancelled = true;
    };
  }, [useGoogle]);

  useEffect(() => {
    if (!useGoogle) return;
    const google = (window as unknown as { google?: any }).google;
    const map = googleMapRef.current;
    if (!google?.maps || !map) return;
    for (const m of googleMarkersRef.current) m.setMap(null);
    googleMarkersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    for (const d of items) {
      if (!d.location) continue;
      const st = FLEET_STATUS[d.status];
      const marker = new google.maps.Marker({
        map,
        position: { lat: d.location.lat, lng: d.location.lng },
        title: `${d.name ?? "Motorista"} — ${st.label}`,
        label: { text: (d.name ?? "").split(" ")[0] || " ", color: "#111", fontSize: "11px", fontWeight: "600" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: st.color,
          fillOpacity: 1,
          strokeColor: "#111",
          strokeWeight: 2,
          labelOrigin: new google.maps.Point(0, 2.6)
        }
      });
      googleMarkersRef.current.push(marker);
      bounds.extend(marker.getPosition());
      count += 1;
    }
    if (count > 1) map.fitBounds(bounds, 60);
    else if (count === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(13);
    }
  }, [items, useGoogle, googleReady]);

  // Mapa OpenStreetMap (sem chave do Google).
  useEffect(() => {
    if (useGoogle) return;
    let cancelled = false;
    void (async () => {
      if (!mapEl.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !mapEl.current) return;
      const map = L.map(mapEl.current, { zoomControl: true }).setView([-20.2976, -40.2958], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      // Leaflet precisa recalcular o tamanho depois que o layout estabiliza.
      window.setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [useGoogle]);

  // Atualiza os marcadores (círculos coloridos — não dependem de imagens).
  useEffect(() => {
    if (useGoogle) return;
    void (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();
      const pts: [number, number][] = [];
      for (const d of items) {
        if (!d.location) continue;
        const st = FLEET_STATUS[d.status];
        const ll: [number, number] = [d.location.lat, d.location.lng];
        pts.push(ll);
        L.circleMarker(ll, { radius: 10, color: "#111", weight: 2, fillColor: st.color, fillOpacity: 0.95 })
          .bindPopup(
            `<b>${d.name ?? "Motorista"}</b><br/>${st.label}<br/><small>posição ${ago(d.location.recorded_at)}</small>` +
              (d.next_trip ? `<br/><small>Próxima: ${formatBrDateTime(d.next_trip.scheduled_at)} · ${d.next_trip.passenger ?? ""}</small>` : "")
          )
          .bindTooltip(d.name?.split(" ")[0] ?? "", { permanent: true, direction: "right", offset: [10, 0], className: "fleet-tip" })
          .addTo(layer);
      }
      if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
      else if (pts.length === 1) map.setView(pts[0], 13);
    })();
  }, [items, useGoogle]);

  const counts = ORDER.map((s) => ({ s, n: items.filter((i) => i.status === s).length }));
  const sorted = [...items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  function focus(d: FleetItem) {
    if (!d.location) return;
    if (useGoogle && googleMapRef.current) {
      googleMapRef.current.setCenter({ lat: d.location.lat, lng: d.location.lng });
      googleMapRef.current.setZoom(15);
    } else if (mapRef.current) mapRef.current.setView([d.location.lat, d.location.lng], 15);
  }

  return (
    <section className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-prime-border bg-white shadow-prime-card">
        <div ref={mapEl} style={{ height: 420 }} />
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-prime-border px-4 py-3 text-xs">
          {counts.map(({ s, n }) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-6 rounded-full" style={{ background: FLEET_STATUS[s].color }} />
              {FLEET_STATUS[s].label} <b>{n}</b>
            </span>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((d) => (
          <li key={d.id} className="rounded-xl border border-prime-border bg-white p-3 text-sm">
            <button type="button" onClick={() => focus(d)} className="flex w-full items-start gap-3 text-left">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: FLEET_STATUS[d.status].color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.name ?? "Motorista"}</span>
                <span className="block text-xs text-prime-muted">
                  {FLEET_STATUS[d.status].label}
                  {d.location ? ` · posição ${ago(d.location.recorded_at)}` : " · sem posição de GPS"}
                </span>
                {d.next_trip ? (
                  <span className="mt-1 block truncate text-xs">
                    Próxima: {formatBrDateTime(d.next_trip.scheduled_at)} · {d.next_trip.passenger ?? "—"}
                  </span>
                ) : null}
              </span>
            </button>
            {d.next_trip ? (
              <Link href={`/agenda?trip=${d.next_trip.id}`} className="mt-2 inline-block text-xs text-prime-gold hover:underline">
                Abrir corrida
              </Link>
            ) : null}
          </li>
        ))}
        {items.length === 0 && !error ? <li className="text-sm text-prime-muted">Nenhum motorista ativo cadastrado.</li> : null}
      </ul>
    </section>
  );
}
