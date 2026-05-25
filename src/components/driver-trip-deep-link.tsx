"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Destaca corrida quando o motorista abre a app a partir de uma notificação (?trip=uuid). */
export function DriverTripDeepLink() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("trip")?.trim();

  useEffect(() => {
    if (!tripId) return;
    const el = document.querySelector(`[data-driver-trip-id="${tripId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400/80");
      const t = setTimeout(() => el.classList.remove("ring-2", "ring-amber-400/80"), 4000);
      return () => clearTimeout(t);
    }
  }, [tripId]);

  if (!tripId) return null;

  return (
    <p className="text-xs text-amber-300/90" role="status">
      Notificação: corrida <span className="font-mono">{tripId.slice(0, 8)}…</span> — procure na lista abaixo.
    </p>
  );
}
