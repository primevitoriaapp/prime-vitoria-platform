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
  next_trip: {
    id: string;
    scheduled_at: string;
    passenger: string | null;
    origin: string | null;
    origin_lat?: number | null;
    origin_lng?: number | null;
    status: string;
    vehicle?: { model: string | null; plate: string | null } | null;
  } | null;
};

type Props = {
  tenantId: string | null;
  /** "full": tela própria, mapa grande com a lista ao lado. */
  variant?: "compact" | "full";
};

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

function isStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 15 * 60000;
}

function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function popupHtml(d: FleetItem): string {
  const st = FLEET_STATUS[d.status];
  const phone = d.phone ? d.phone.replace(/\D/g, "") : "";
  return (
    `<div style="font:13px system-ui;min-width:180px"><b>${esc(d.name ?? "Motorista")}</b><br/>` +
    `<span style="color:${st.color};font-weight:600">${st.label}</span>` +
    (d.location ? `<br/><small>posição ${ago(d.location.recorded_at)}</small>` : "") +
    (d.next_trip
      ? `<br/><small>Próxima: ${formatBrDateTime(d.next_trip.scheduled_at)} · ${esc(d.next_trip.passenger)}</small>` +
        `<br/><a href="/agenda?trip=${d.next_trip.id}#trip-detail" style="color:#a8873a;font-weight:600">Abrir corrida</a>`
      : "") +
    (phone ? ` · <a href="tel:${phone}" style="color:#a8873a">Ligar</a>` : "") +
    `</div>`
  );
}

/** Mapa da central: cada motorista com a cor da situação (livre, ocupado, deslocando, corrida em breve). */
export function LiveMap({ tenantId, variant = "compact" }: Props) {
  const full = variant === "full";
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [items, setItems] = useState<FleetItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<FleetStatus>>(new Set());
  const [q, setQ] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const fittedRef = useRef(false);
  const [fitTick, setFitTick] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/operations/fleet-map", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { items: FleetItem[] } };
    if (res.ok && json.success && json.data) {
      setItems(json.data.items);
      setUpdatedAt(new Date());
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

  const visibleItems = items.filter(
    (d) => !hidden.has(d.status) && (!q.trim() || (d.name ?? "").toLowerCase().includes(q.trim().toLowerCase()))
  );
  const shouldFit = () => {
    if (fittedRef.current) return false;
    fittedRef.current = true;
    return true;
  };

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
    const info = new google.maps.InfoWindow();
    for (const d of visibleItems) {
      const nt = d.next_trip;
      if (nt?.origin_lat != null && nt?.origin_lng != null) {
        const pickup = new google.maps.Marker({
          map,
          position: { lat: nt.origin_lat, lng: nt.origin_lng },
          title: `Embarque de ${d.name ?? "motorista"} — ${formatBrDateTime(nt.scheduled_at)}`,
          icon: { path: "M -6 -6 L 6 -6 L 6 6 L -6 6 z", scale: 1, fillColor: "#c9a84c", fillOpacity: 1, strokeColor: "#111", strokeWeight: 2 }
        });
        googleMarkersRef.current.push(pickup);
      }
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
      marker.addListener("click", () => {
        info.setContent(popupHtml(d));
        info.open({ map, anchor: marker });
      });
      googleMarkersRef.current.push(marker);
      bounds.extend(marker.getPosition());
      count += 1;
    }
    if (count > 0 && shouldFit()) {
      if (count > 1) map.fitBounds(bounds, 60);
      else {
        map.setCenter(bounds.getCenter());
        map.setZoom(13);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, useGoogle, googleReady, hidden, q, fitTick]);

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
      for (const d of visibleItems) {
        const nt = d.next_trip;
        if (nt?.origin_lat != null && nt?.origin_lng != null) {
          L.circleMarker([nt.origin_lat, nt.origin_lng], { radius: 6, color: "#111", weight: 2, fillColor: "#c9a84c", fillOpacity: 1 })
            .bindTooltip(`Embarque · ${formatBrDateTime(nt.scheduled_at)}`)
            .addTo(layer);
        }
        if (!d.location) continue;
        const st = FLEET_STATUS[d.status];
        const ll: [number, number] = [d.location.lat, d.location.lng];
        pts.push(ll);
        L.circleMarker(ll, { radius: 10, color: "#111", weight: 2, fillColor: st.color, fillOpacity: 0.95 })
          .bindPopup(popupHtml(d))
          .bindTooltip(d.name?.split(" ")[0] ?? "", { permanent: true, direction: "right", offset: [10, 0], className: "fleet-tip" })
          .addTo(layer);
      }
      if (pts.length > 0 && shouldFit()) {
        if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
        else map.setView(pts[0], 13);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, useGoogle, hidden, q, fitTick]);

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
    <section className={full ? "grid gap-3 lg:grid-cols-[1fr_340px] lg:items-start" : "space-y-3"}>
      <div className="overflow-hidden rounded-xl border border-prime-border bg-white shadow-prime-card">
        <div ref={mapEl} style={{ height: full ? "calc(100vh - 220px)" : 420, minHeight: 420 }} />
        <div className="flex flex-wrap items-center gap-2 border-t border-prime-border px-4 py-3 text-xs">
          {counts.map(({ s, n }) => {
            const off = hidden.has(s);
            return (
              <button
                key={s}
                type="button"
                title={off ? "Mostrar no mapa" : "Esconder do mapa"}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    return next;
                  })
                }
                className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 ring-1 ${off ? "opacity-40 ring-prime-border" : "ring-prime-border hover:ring-prime-gold"}`}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FLEET_STATUS[s].color }} />
                {FLEET_STATUS[s].label} <b>{n}</b>
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1.5 px-1 text-prime-muted">
            <span className="inline-block h-2.5 w-2.5 rotate-45 bg-[#c9a84c] ring-1 ring-[#111]" /> embarque da próxima corrida
          </span>
          <span className="ml-auto flex items-center gap-3">
            {updatedAt ? <span className="text-prime-muted">Atualizado {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span> : null}
            <button
              type="button"
              className="rounded-full px-2.5 py-1 font-semibold ring-1 ring-prime-border hover:ring-prime-gold"
              onClick={() => {
                fittedRef.current = false;
                setFitTick((n) => n + 1);
              }}
            >
              Ver todos
            </button>
          </span>
        </div>
      </div>
      <div className={full ? "space-y-2 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto" : "space-y-3"}>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {full ? (
        <input className="prime-input" placeholder="Buscar motorista" value={q} onChange={(e) => setQ(e.target.value)} />
      ) : null}
      <ul className={full ? "grid gap-2" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-3"}>
        {sorted.filter((d) => visibleItems.includes(d)).map((d) => (
          <li key={d.id} className="rounded-xl border border-prime-border bg-white p-3 text-sm">
            <button type="button" onClick={() => focus(d)} className="flex w-full items-start gap-3 text-left">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: FLEET_STATUS[d.status].color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.name ?? "Motorista"}</span>
                <span className="block text-xs text-prime-muted">
                  {FLEET_STATUS[d.status].label}
                  {d.location ? ` · posição ${ago(d.location.recorded_at)}` : " · sem posição de GPS"}
                </span>
                {d.location && isStale(d.location.recorded_at) ? (
                  <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">
                    sinal antigo: app fechado ou sem internet
                  </span>
                ) : null}
                {d.next_trip ? (
                  <span className="mt-1 block truncate text-xs">
                    Próxima: {formatBrDateTime(d.next_trip.scheduled_at)} · {d.next_trip.passenger ?? "—"}
                    {d.next_trip.vehicle?.plate ? ` · ${d.next_trip.vehicle.plate}` : ""}
                  </span>
                ) : null}
              </span>
            </button>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {d.next_trip ? (
                <Link href={`/agenda?trip=${d.next_trip.id}#trip-detail`} className="font-semibold text-prime-gold hover:underline">
                  Abrir corrida
                </Link>
              ) : null}
              {d.phone ? (
                <>
                  <a href={`tel:${d.phone.replace(/\D/g, "")}`} className="text-prime-gold hover:underline">
                    Ligar
                  </a>
                  <a
                    href={`https://wa.me/55${d.phone.replace(/\D/g, "").replace(/^55/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-prime-gold hover:underline"
                  >
                    WhatsApp
                  </a>
                </>
              ) : null}
            </div>
          </li>
        ))}
        {items.length === 0 && !error ? <li className="text-sm text-prime-muted">Nenhum motorista ativo cadastrado.</li> : null}
      </ul>
      </div>
    </section>
  );
}
