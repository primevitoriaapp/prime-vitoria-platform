"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const FOCUS_EVENT = "pv-driver-focus-trip";

/** Dispara actualização da lista quando abre via notificação (?trip=uuid). */
export function dispatchDriverTripFocus(tripId: string) {
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { tripId } }));
}

/** Destaca corrida quando o motorista abre a app a partir de uma notificação (?trip=uuid). */
export function DriverTripDeepLink() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("trip")?.trim();
  const [pending, setPending] = useState(Boolean(tripId));

  useEffect(() => {
    if (!tripId) return;
    dispatchDriverTripFocus(tripId);
    setPending(true);
  }, [tripId]);

  useEffect(() => {
    if (!tripId || !pending) return;

    function tryScroll() {
      const el = document.querySelector(`[data-driver-trip-id="${tripId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-amber-400/80");
        const t = setTimeout(() => el.classList.remove("ring-2", "ring-amber-400/80"), 5000);
        setPending(false);
        return () => clearTimeout(t);
      }
      return undefined;
    }

    let cleanup = tryScroll();
    const retries = [400, 1200, 2500].map((ms) =>
      setTimeout(() => {
        cleanup?.();
        cleanup = tryScroll();
      }, ms)
    );
    return () => {
      cleanup?.();
      retries.forEach(clearTimeout);
    };
  }, [tripId, pending]);

  useEffect(() => {
    if (!tripId) return;
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ tripId: string }>).detail?.tripId;
      if (id === tripId) setPending(true);
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, [tripId]);

  if (!tripId) return null;

  return (
    <div
      className="rounded-lg border border-amber-600/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
      role="status"
    >
      {pending ? "A abrir corrida da notificação…" : "Corrida da notificação"}
      <span className="ml-1 font-mono text-xs text-amber-300/90">{tripId.slice(0, 8)}…</span>
    </div>
  );
}
