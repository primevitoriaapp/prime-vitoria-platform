"use client";

import type { TripPickupStop } from "@/lib/trips/trip-pickup-stops";
import {
  allPickupStopsCompleted,
  completedPickupStopCount,
  hasMultiplePickupStops,
  nextIncompletePickupStopIndex
} from "@/lib/trips/trip-pickup-stops";
import { buildNavigationLinksToPoint } from "@/lib/trips/driver-nav-links";

type Props = {
  stops: TripPickupStop[];
  isBusy?: boolean;
  onCompleteStop: (stopIndex: number) => void;
};

export function DriverPickupStopsPanel({ stops, isBusy = false, onCompleteStop }: Props) {
  if (!hasMultiplePickupStops(stops)) return null;

  const total = stops.length;
  const done = completedPickupStopCount(stops);
  const currentIdx = nextIncompletePickupStopIndex(stops);
  const allDone = allPickupStopsCompleted(stops);

  return (
    <div className="mt-4 rounded-xl border border-sky-300/40 bg-sky-50/90 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">
        Sequência de embarques ({done}/{total})
      </p>
      <ol className="mt-3 space-y-2">
        {stops.map((stop, idx) => {
          const isCurrent = idx === currentIdx;
          const isDone = Boolean(stop.completed_at);
          return (
            <li
              key={`${idx}-${stop.passenger_name}`}
              className={[
                "rounded-lg border px-3 py-2 text-sm",
                isDone
                  ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
                  : isCurrent
                    ? "border-sky-400 bg-white text-prime-text ring-1 ring-sky-300/60"
                    : "border-prime-border bg-prime-bg/50 text-prime-muted"
              ].join(" ")}
            >
              <p className="font-medium">
                Parada {idx + 1} de {total}: {stop.passenger_name}
                {isDone ? (
                  <span className="ml-2 text-xs font-semibold text-emerald-700">✓ Concluída</span>
                ) : isCurrent ? (
                  <span className="ml-2 text-xs font-semibold text-sky-700">Actual</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs">{stop.pickup_text}</p>
              {stop.passenger_phone?.trim() ? (
                <p className="mt-1 text-xs">
                  <a href={`tel:${stop.passenger_phone.trim()}`} className="text-prime-gold hover:underline">
                    {stop.passenger_phone.trim()}
                  </a>
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      {!allDone && currentIdx != null ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-prime-text">
            Parada {currentIdx + 1} de {total}: {stops[currentIdx]?.passenger_name} —{" "}
            {stops[currentIdx]?.pickup_text}
          </p>
          {(() => {
            const stop = stops[currentIdx];
            if (!stop) return null;
            const nav =
              buildNavigationLinksToPoint({
                lat: stop.pickup_lat ?? null,
                lng: stop.pickup_lng ?? null,
                label: stop.pickup_text
              }).find((l) => l.id === "waze") ??
              buildNavigationLinksToPoint({
                lat: stop.pickup_lat ?? null,
                lng: stop.pickup_lng ?? null,
                label: stop.pickup_text
              })[0];
            return nav ? (
              <a
                href={nav.href}
                target={nav.id === "waze" ? undefined : "_blank"}
                rel={nav.id === "waze" ? undefined : "noopener noreferrer"}
                className="flex min-h-[2.75rem] w-full items-center justify-center rounded-xl border border-sky-400/50 bg-white px-4 py-2.5 text-sm font-semibold text-sky-950 hover:border-sky-500"
              >
                Ir até parada {currentIdx + 1} — {nav.label}
              </a>
            ) : null;
          })()}
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCompleteStop(currentIdx)}
            className="btn-primary min-h-[2.75rem] w-full rounded-xl px-4 py-2.5 text-base disabled:opacity-50"
          >
            {isBusy ? "A guardar…" : `Marcar parada ${currentIdx + 1} concluída`}
          </button>
        </div>
      ) : allDone ? (
        <p className="mt-3 text-sm text-emerald-800">Todos os embarques concluídos — siga para o destino final.</p>
      ) : null}
    </div>
  );
}
