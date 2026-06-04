"use client";

import { formatBrDateTime } from "@/lib/dates/br-date";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { StatusBadge } from "@/components/status-badge";
import { DriverOperationalTimeline } from "@/components/driver-operational-timeline";
import { DriverTripRouteCard } from "@/components/driver-trip-route-card";
import { buildDriverNavigationLinks } from "@/lib/trips/driver-nav-links";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import {
  driverFlowChip,
  driverOperationalHint,
  driverPrimaryActionLabel
} from "@/lib/trips/driver-step-copy";
import { formatTripKmLine } from "@/lib/trips/format-km";
import { confirmDriverStatusTransition } from "@/lib/trips/driver-status-confirm";

type Props = {
  trip: Trip;
  isBusy: boolean;
  highlighted?: boolean;
  onStatus: (tripId: string, to: TripOperationalStatus) => void;
  onGps: (trip: Trip) => void;
};

export function DriverActiveTripHero({ trip, isBusy, highlighted, onStatus, onGps }: Props) {
  const dest = { lat: trip.destination_lat, lng: trip.destination_lng, label: trip.destination_text };
  const navLinks = buildDriverNavigationLinks({
    origin: { lat: trip.origin_lat, lng: trip.origin_lng, label: trip.origin_text },
    destination: dest
  });
  const primaryNav = navLinks.find((l) => l.id === "waze") ?? navLinks[0];
  const next = driverNextStatuses(trip.operational_status);
  const primaryStep = next[0];
  const extraSteps = next.slice(1);
  const scheduledLabel = formatBrDateTime(trip.scheduled_at);

  return (
    <article
      data-driver-trip-id={trip.id}
      className={[
        "rounded-2xl border-2 bg-gradient-to-b from-slate-900 to-slate-950 p-4 shadow-lg md:p-6",
        highlighted ? "border-amber-400 ring-2 ring-amber-400/50" : "border-amber-500/60"
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Corrida actual</p>
      <p className="mt-1 text-sm text-amber-100/90">{driverOperationalHint(trip.operational_status)}</p>
      <p className="mt-2 rounded-md bg-slate-800/60 px-2 py-1 text-xs text-slate-400">{driverFlowChip(trip.operational_status)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={trip.operational_status} />
        <span className="font-mono text-xs text-slate-500">{trip.id.slice(0, 8)}…</span>
      </div>

      <DriverOperationalTimeline current={trip.operational_status} variant="hero" />

      <p className="mt-3 text-lg font-semibold text-white">
        {trip.passenger_name?.trim() || "Passageiro"}
        {trip.service_type ? <span className="text-base font-normal text-slate-500"> · {trip.service_type}</span> : null}
      </p>

      <DriverTripRouteCard
        originText={trip.origin_text ?? "—"}
        destinationText={trip.destination_text ?? "—"}
        scheduledLabel={
          trip.vehicle
            ? `${scheduledLabel} · ${trip.vehicle.plate} (${trip.vehicle.model})`
            : scheduledLabel
        }
      />

      {(() => {
        const km = formatTripKmLine(trip);
        return km ? <p className="mt-2 text-xs text-slate-500">{km}</p> : null;
      })()}

      {primaryNav ? (
        <a
          href={primaryNav.href}
          target={primaryNav.id === "waze" ? undefined : "_blank"}
          rel={primaryNav.id === "waze" ? undefined : "noopener noreferrer"}
          className="mt-4 flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl border-2 border-sky-400 bg-sky-600/30 px-4 py-3 text-lg font-bold text-white hover:bg-sky-600/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        >
          <span aria-hidden>🧭</span> Navegar — {primaryNav.label}
        </a>
      ) : (
        <p className="mt-4 text-sm text-amber-200/80">Sem coordenadas GPS — use o endereço no Maps manualmente.</p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {primaryStep ? (
          <button
            type="button"
            disabled={isBusy}
            aria-busy={isBusy}
            onClick={() => {
              if (!confirmDriverStatusTransition(primaryStep)) return;
              onStatus(trip.id, primaryStep);
            }}
            className="min-h-[3.5rem] w-full rounded-xl bg-amber-500 px-4 py-3 text-xl font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {isBusy ? "A processar…" : driverPrimaryActionLabel(trip.operational_status, primaryStep)}
          </button>
        ) : null}
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onGps(trip)}
          className="min-h-[2.75rem] w-full rounded-xl border border-slate-600 px-4 py-2.5 text-base text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Enviar GPS agora
        </button>
        {extraSteps.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {extraSteps.map((s) => (
              <button
                key={s}
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (!confirmDriverStatusTransition(s)) return;
                  onStatus(trip.id, s);
                }}
                className="min-h-[2.5rem] rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {STATUS_CORRIDA_PT[s]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {navLinks.length > 1 ? (
        <p className="mt-3 text-xs text-slate-500">
          Também:{" "}
          {navLinks.map((link, i) => (
            <span key={link.id}>
              {i > 0 ? " · " : null}
              <a href={link.href} className="text-sky-400 hover:underline" target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}
