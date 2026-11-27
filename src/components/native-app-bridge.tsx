"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native/native-geo";

const OWN = /(^|\.)primevitoria\.com$/;

/**
 * No app instalado, links para fora (WhatsApp, Waze, Maps, telefone, comprovantes)
 * não abrem sozinhos dentro do app. Aqui eles vão para o app certo do celular.
 */
export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const openOutside = (href: string) => {
      // Fora do nosso domínio o app entrega o endereço ao Android (WhatsApp, Waze, navegador…).
      window.location.href = href;
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a || !a.href) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      const external = url.protocol !== "http:" && url.protocol !== "https:" ? true : !OWN.test(url.hostname);
      if (!external && a.target !== "_blank") return;
      e.preventDefault();
      openOutside(url.href);
    };
    document.addEventListener("click", onClick, true);
    const original = window.open;
    window.open = ((u?: string | URL) => {
      if (u) openOutside(String(u));
      return null;
    }) as typeof window.open;
    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = original;
    };
  }, []);
  return null;
}
