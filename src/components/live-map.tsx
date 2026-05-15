"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type DriverPoint = { driver_id: string; lat: number; lng: number; recorded_at: string };

type Props = {
  /** Mapa ao vivo: última posição por motorista (Realtime + carga inicial). */
  tenantId: string | null;
};

function dedupeLatest(rows: { driver_id: string; lat: number; lng: number; recorded_at: string }[]): DriverPoint[] {
  const byDriver = new Map<string, DriverPoint>();
  for (const r of rows) {
    const prev = byDriver.get(r.driver_id);
    if (!prev || new Date(r.recorded_at).getTime() >= new Date(prev.recorded_at).getTime()) {
      byDriver.set(r.driver_id, {
        driver_id: r.driver_id,
        lat: Number(r.lat),
        lng: Number(r.lng),
        recorded_at: r.recorded_at
      });
    }
  }
  return [...byDriver.values()];
}

export function LiveMap({ tenantId }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let mapCleanup = () => {};

    async function boot() {
      if (!mapRef.current) return;
      const L = await import("leaflet");

      const map = L.map(mapRef.current).setView([-20.2976, -40.2958], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      function upsertMarkers(points: DriverPoint[]) {
        for (const p of points) {
          const id = p.driver_id;
          const latlng: [number, number] = [p.lat, p.lng];
          let m = markersRef.current.get(id);
          if (!m) {
            m = L.marker(latlng).addTo(map).bindPopup(`Motorista ${id.slice(0, 8)}…`);
            markersRef.current.set(id, m);
          } else {
            m.setLatLng(latlng);
          }
        }
      }

      if (!tenantId) {
        L.marker([-20.3155, -40.3128]).addTo(map).bindPopup("Exemplo (inicie sessão operacional para posições reais)");
        mapCleanup = () => {
          map.remove();
          markersRef.current.clear();
        };
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: initial } = await supabase
          .from("driver_locations")
          .select("driver_id, lat, lng, recorded_at")
          .eq("tenant_id", tenantId)
          .order("recorded_at", { ascending: false })
          .limit(400);

        if (!cancelled && initial?.length) {
          const pts = dedupeLatest(initial as DriverPoint[]);
          upsertMarkers(pts);
          if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 13);
        }

        const filter = `tenant_id=eq.${tenantId}`;
        const channel = supabase
          .channel(`driver-loc-${tenantId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "driver_locations", filter },
            (payload) => {
              if (cancelled) return;
              const row = payload.new as { driver_id?: string; lat?: number; lng?: number; recorded_at?: string };
              if (row.driver_id != null && row.lat != null && row.lng != null && row.recorded_at) {
                upsertMarkers([
                  {
                    driver_id: row.driver_id,
                    lat: Number(row.lat),
                    lng: Number(row.lng),
                    recorded_at: row.recorded_at
                  }
                ]);
              }
            }
          )
          .subscribe();

        mapCleanup = () => {
          void supabase.removeChannel(channel);
          map.remove();
          markersRef.current.clear();
        };
      } catch {
        L.marker([-20.3155, -40.3128]).addTo(map).bindPopup("Configure Supabase no ambiente para o mapa ao vivo.");
        mapCleanup = () => {
          map.remove();
          markersRef.current.clear();
        };
      }
    }

    void boot();
    return () => {
      cancelled = true;
      mapCleanup();
    };
  }, [tenantId]);

  return <div className="card" ref={mapRef} style={{ height: 360 }} />;
}
