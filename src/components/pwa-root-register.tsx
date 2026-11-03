"use client";

import { useEffect } from "react";

/**
 * Registra o service worker raiz (escopo "/") para o celular aceitar "Instalar app"
 * em qualquer Android: o app do motorista abre em "/driver", fora do escopo "/driver/".
 */
export function PwaRootRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const { protocol, hostname } = window.location;
    if (protocol !== "https:" && hostname !== "localhost") return;
    void navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => {
        if (reg && reg.scope === `${window.location.origin}/`) return;
        return navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      })
      .catch(() => undefined);
  }, []);
  return null;
}
