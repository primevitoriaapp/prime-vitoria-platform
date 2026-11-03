"use client";

import { useEffect, useRef } from "react";

const EVERY_MS = 60_000;

/**
 * Com o app aberto, manda a posição do motorista para a central a cada minuto (mesmo sem corrida),
 * para ele aparecer no mapa "Ao vivo". Durante a corrida, o rastreio da corrida continua por conta própria.
 */
export function useDriverPresenceBeacon(enabled: boolean) {
  const last = useRef(0);
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    const send = (lat: number, lng: number) => {
      const now = Date.now();
      if (now - last.current < EVERY_MS) return;
      last.current = now;
      void fetch("/api/drivers/location", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, recorded_at: new Date().toISOString() })
      }).catch(() => undefined);
    };
    const id = navigator.geolocation.watchPosition(
      (p) => send(p.coords.latitude, p.coords.longitude),
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 30_000 }
    );
    // Parado no mesmo lugar o watch pode não disparar: pede a posição de novo a cada minuto.
    const t = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition((p) => send(p.coords.latitude, p.coords.longitude), () => undefined, { maximumAge: 60_000, timeout: 20_000 });
    }, EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(id);
      window.clearInterval(t);
    };
  }, [enabled]);
}
