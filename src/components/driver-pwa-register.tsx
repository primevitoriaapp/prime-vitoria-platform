"use client";

import { useEffect } from "react";

/**
 * Regista Service Worker apenas sob `/driver` (scope `/driver/`), sem interferir no resto do site.
 */
export function DriverPwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const { protocol, hostname } = window.location;
    if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") return;

    void navigator.serviceWorker
      .register("/driver/service-worker.js", { scope: "/driver/" })
      .catch((err: unknown) => {
        console.warn("[driver-pwa] service worker registration failed", err);
      });
  }, []);

  return null;
}
