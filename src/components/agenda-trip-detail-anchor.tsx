"use client";

import { useEffect } from "react";

/** Rola até o painel de detalhe quando a agenda abre com ?trip= */
export function AgendaTripDetailAnchor({ tripId }: { tripId: string }) {
  useEffect(() => {
    if (!tripId) return;
    const scroll = () => {
      document.getElementById("trip-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const timer = window.setTimeout(scroll, 150);
    return () => window.clearTimeout(timer);
  }, [tripId]);

  return null;
}
