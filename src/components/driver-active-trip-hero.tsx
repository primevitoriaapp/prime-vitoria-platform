"use client";

import { formatBrDateTime } from "@/lib/dates/br-date";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { StatusBadge } from "@/components/status-badge";
import { TripLegLabelBadge } from "@/components/trip-leg-label-badge";
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

const WAIT_ELIGIBLE: TripOperationalStatus[] = ["on_the_way", "arrived", "in_progress"];

type Props = {
  trip: Trip;
  isBusy: boolean;
  highlighted?: boolean;
  waitElapsedLabel?: string | null;
  waitBusy?: boolean;
  onStatus: (tripId: string, to: TripOperationalStatus) => void;
  onGps: (trip: Trip) => void;
  onWaitStart?: (tripId: string) => void;
  onWaitStop?: (tripId: string) => void;
};

export function DriverActiveTripHero({
  trip,
  isBusy,
  highlighted,
  waitElapsedLabel,
  waitBusy = false,
  onStatus,
  onGps,
  onWaitStart,
  onWaitStop
}: Props) {
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
  const canWait = WAIT_ELIGIBLE.includes(trip.operational_status);
  const isWaiting = Boolean(trip.wait_started_at);
  const accumulatedWait = trip.wait_minutes ?? 0;

  return (
    <article
      data-driver-trip-id={trip.id}
      className={[
        "prime-driver-hero p-4 md:p-6",
        highlighted ? "ring-2 ring-prime-gold/40" : ""
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-prime-gold">Corrida actual</p>
      <p className="mt-1 text-sm text-prime-muted">{driverOperationalHint(trip.operational_status)}</p>
      <p className="mt-2 rounded-md bg-prime-bg px-2 py-1 text-xs text-prime-muted">{driverFlowChip(trip.operational_status)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={trip.operational_status} />
        <TripLegLabelBadge label={trip.trip_leg_label} />
        <span className="font-mono text-xs text-prime-muted">{trip.id.slice(0, 8)}…</span>
      </div>

      <DriverOperationalTimeline current={trip.operational_status} variant="hero" />

      <p className="mt-3 text-lg font-semibold text-prime-text">
        {trip.passenger_name?.trim() || "Passageiro"}
        {trip.service_type ? (
          <span className="text-base font-normal text-prime-muted">
            {" "}
            · {primeServiceTypeLabel(trip.service_type, { audience: "operator", scheduledAt: trip.scheduled_at })}
          </span>
        ) : null}
        {trip.passenger_count != null && trip.passenger_count > 0 ? (
          <span className="text-base font-normal text-prime-muted"> · {trip.passenger_count} passageiros</span>
        ) : null}
      </p>
      {trip.passenger_phone?.trim() ? (
        <p className="mt-1 text-sm text-prime-muted">
          Telefone:{" "}
          <a href={`tel:${trip.passenger_phone.trim()}`} className="font-medium text-prime-gold hover:underline">
            {trip.passenger_phone.trim()}
          </a>
        </p>
      ) : null}

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
        return km ? <p className="mt-2 text-xs text-prime-muted">{km}</p> : null;
      })()}

      {primaryNav ? (
        <a
          href={primaryNav.href}
          target={primaryNav.id === "waze" ? undefined : "_blank"}
          rel={primaryNav.id === "waze" ? undefined : "noopener noreferrer"}
          className="mt-4 flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl border-2 border-prime-border bg-prime-bg px-4 py-3 text-lg font-bold text-prime-text hover:border-prime-gold/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prime-gold"
        >
          <span aria-hidden>🧭</span> Navegar — {primaryNav.label}
        </a>
      ) : (
        <p className="mt-4 text-sm text-prime-muted">Sem coordenadas GPS — use o endereço no Maps manualmente.</p>
      )}

      {canWait && onWaitStart && onWaitStop ? (
        <div className="mt-4 rounded-xl border border-prime-border bg-prime-bg/80 p-3">
          {isWaiting ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Aguardando passageiro</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-prime-text">
                {waitElapsedLabel ?? "00:00"}
              </p>
              {accumulatedWait > 0 ? (
                <p className="mt-1 text-xs text-prime-muted">Total registado: {accumulatedWait} min</p>
              ) : null}
              <button
                type="button"
                disabled={isBusy || waitBusy}
                onClick={() => onWaitStop(trip.id)}
                className="btn-primary mt-3 min-h-[2.75rem] w-full rounded-xl px-4 py-2.5 text-base disabled:opacity-50"
              >
                {waitBusy ? "A guardar…" : "Retomar corrida"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={isBusy || waitBusy}
              onClick={() => onWaitStart(trip.id)}
              className="btn-outline min-h-[2.75rem] w-full rounded-xl border-amber-300/60 px-4 py-2.5 text-base text-amber-900 hover:bg-amber-50 disabled:opacity-50"
            >
              Aguardando passageiro
            </button>
          )}
        </div>
      ) : null}

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
            className="btn-primary min-h-[3.5rem] w-full rounded-xl px-4 py-3 text-xl disabled:opacity-60"
          >
            {isBusy ? "A processar…" : driverPrimaryActionLabel(trip.operational_status, primaryStep)}
          </button>
        ) : null}
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onGps(trip)}
          className="btn-outline min-h-[2.75rem] w-full rounded-xl px-4 py-2.5 text-base disabled:opacity-50"
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
                className="btn-outline min-h-[2.5rem] rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              >
                {driverPrimaryActionLabel(trip.operational_status, s)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {navLinks.length > 1 ? (
        <p className="mt-3 text-xs text-prime-muted">
          Também:{" "}
          {navLinks.map((link, i) => (
            <span key={link.id}>
              {i > 0 ? " · " : null}
              <a href={link.href} className="text-prime-gold hover:underline" target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}
