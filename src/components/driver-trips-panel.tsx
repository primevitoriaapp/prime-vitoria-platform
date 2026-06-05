"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { driverPrimaryActionLabel } from "@/lib/trips/driver-step-copy";
import { StatusBadge } from "@/components/status-badge";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { buildDriverNavigationLinks } from "@/lib/trips/driver-nav-links";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import { confirmDriverStatusTransition } from "@/lib/trips/driver-status-confirm";
import { pickPrimaryActiveTripId } from "@/lib/trips/driver-step-copy";
import { formatTripKmLine } from "@/lib/trips/format-km";
import { DriverTripSkeleton } from "@/components/driver-trip-skeleton";
import { DriverOperationalTimeline } from "@/components/driver-operational-timeline";
import { DriverActiveTripHero } from "@/components/driver-active-trip-hero";
import { DriverTripRouteCard } from "@/components/driver-trip-route-card";
import { useDriverPushRefresh } from "@/hooks/use-driver-push-refresh";
import { useDocumentVisible } from "@/hooks/use-document-visible";

const ACTIVE: TripOperationalStatus[] = [
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress"
];

const HISTORY: TripOperationalStatus[] = ["completed", "cancelled", "no_show", "rejected"];

const FOCUS_EVENT = "pv-driver-focus-trip";

type Props = {
  tenantId?: string | null;
  driverIdFilter?: string | null;
  devFallbackRole?: "motorista" | "admin";
};

export function DriverTripsPanel({
  tenantId = null,
  driverIdFilter = null,
  devFallbackRole = "motorista"
}: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [highlightTripId, setHighlightTripId] = useState<string | null>(null);
  const docVisible = useDocumentVisible();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const params = new URLSearchParams({ page: "1", pageSize: "30" });
    if (driverIdFilter) params.set("driverId", driverIdFilter);
    const res = await fetchWithSupabaseSession(`/api/trips?${params}`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: { items: Trip[] }; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setTrips([]);
      setMessage(json.error?.message ?? "Não foi possível carregar corridas.");
      setLoading(false);
      return;
    }
    setTrips(json.data?.items ?? []);
    setMessage(null);
    setLastRefreshAt(new Date());
    setLoading(false);
  }, [devFallbackRole, driverIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => trips.filter((t) => ACTIVE.includes(t.operational_status)), [trips]);
  const primaryId = useMemo(() => pickPrimaryActiveTripId(active), [active]);
  const primaryTrip = active.find((t) => t.id === primaryId) ?? null;
  const otherActive = active.filter((t) => t.id !== primaryId);

  useEffect(() => {
    if (!docVisible) return;
    const timer = setInterval(() => void load({ silent: true }), 15_000);
    return () => clearInterval(timer);
  }, [load, docVisible]);

  useTenantTableRefresh(tenantId, ["trips", "dispatch_offers"], () => void load({ silent: active.length > 0 }));

  useDriverPushRefresh(
    () => void load({ silent: trips.length > 0 }),
    (detail) => {
      const label = detail.title ?? detail.body ?? "Nova actualização";
      setMessage(label);
    }
  );

  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ tripId: string }>).detail?.tripId;
      if (id) {
        setHighlightTripId(id);
        void load({ silent: trips.length > 0 });
      }
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, [load, trips.length]);

  async function setStatus(tripId: string, to_status: TripOperationalStatus) {
    setBusyTrip(tripId);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/status`,
      { method: "POST", body: JSON.stringify({ to_status }) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusyTrip(null);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao actualizar estado.");
      return;
    }
    setMessage(`Estado: ${STATUS_CORRIDA_PT[to_status]}.`);
    await load();
  }

  async function sendGps(trip: Trip) {
    if (!navigator.geolocation) {
      setMessage("GPS indisponível neste dispositivo.");
      return;
    }
    setBusyTrip(trip.id);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await fetchWithSupabaseSession(
          "/api/drivers/location",
          {
            method: "POST",
            body: JSON.stringify({
              trip_id: trip.id,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              recorded_at: new Date().toISOString()
            })
          },
          devFallbackRole
        );
        const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
        setBusyTrip(null);
        setMessage(
          res.ok && json.success ? "Localização enviada (trail KM)." : (json.error?.message ?? "Falha ao enviar GPS.")
        );
      },
      () => {
        setBusyTrip(null);
        setMessage("Permissão de localização negada.");
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }

  const recentHistory = trips
    .filter((t) => HISTORY.includes(t.operational_status))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 10);

  return (
    <>
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white md:text-xl">Corridas</h2>
          <div className="flex flex-col items-end gap-0.5">
            <button
              type="button"
              onClick={() => void load({ silent: trips.length > 0 })}
              disabled={loading && trips.length === 0}
              className="min-h-[2.75rem] rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {loading && trips.length > 0 ? "A actualizar…" : "Actualizar"}
            </button>
            {lastRefreshAt ? (
              <span className="text-[10px] text-slate-500">
                {active.length > 0 ? "Auto 12s · " : "Auto 20s · "}
                {lastRefreshAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {!docVisible ? " · separador inactivo" : null}
              </span>
            ) : null}
          </div>
        </div>

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {loading ? "A carregar corridas…" : message ?? (active.length ? `${active.length} corridas activas` : "Sem corridas activas")}
        </p>
        {message ? <p className="mt-3 text-sm text-amber-200/90" aria-hidden="true">{message}</p> : null}

        {loading ? (
          <DriverTripSkeleton />
        ) : active.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Sem corrida actual. Após despacho da central, a corrida aparece aqui — actualização automática a cada 20s
            (ou notificação push quando activa).
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {primaryTrip ? (
              <DriverActiveTripHero
                trip={primaryTrip}
                isBusy={busyTrip === primaryTrip.id}
                highlighted={highlightTripId === primaryTrip.id}
                onStatus={setStatus}
                onGps={sendGps}
              />
            ) : null}

            {otherActive.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-slate-400">Outras corridas activas ({otherActive.length})</h3>
                <ul className="mt-2 space-y-3">
                  {otherActive.map((trip) => (
                    <CompactActiveTripCard
                      key={trip.id}
                      trip={trip}
                      isBusy={busyTrip === trip.id}
                      onStatus={setStatus}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {recentHistory.length > 0 ? (
        <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-400">
            Últimas concluídas / encerradas ({recentHistory.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {recentHistory.map((trip) => (
              <li key={trip.id} className="border-t border-slate-800 pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={trip.operational_status} />
                  <span className="text-xs text-slate-500">
                    {formatBrDateTime(trip.scheduled_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {trip.origin_text} → {trip.destination_text}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function CompactActiveTripCard({
  trip,
  isBusy,
  onStatus
}: {
  trip: Trip;
  isBusy: boolean;
  onStatus: (id: string, s: TripOperationalStatus) => void;
}) {
  const next = driverNextStatuses(trip.operational_status)[0];
  const nav = buildDriverNavigationLinks({
    origin: { lat: trip.origin_lat, lng: trip.origin_lng, label: trip.origin_text },
    destination: { lat: trip.destination_lat, lng: trip.destination_lng, label: trip.destination_text }
  })[0];

  return (
    <li
      data-driver-trip-id={trip.id}
      className="prime-driver-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={trip.operational_status} />
        <span className="text-sm font-medium text-prime-text">{trip.passenger_name ?? "Passageiro"}</span>
      </div>
      <DriverTripRouteCard originText={trip.origin_text ?? "—"} destinationText={trip.destination_text ?? "—"} />
      <DriverOperationalTimeline current={trip.operational_status} />
      <div className="mt-2 flex flex-wrap gap-2">
        {next ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              if (!confirmDriverStatusTransition(next)) return;
              onStatus(trip.id, next);
            }}
            className="btn-primary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
          >
            {driverPrimaryActionLabel(trip.operational_status, next)}
          </button>
        ) : null}
        {nav ? (
          <a
            href={nav.href}
            className="rounded-lg border border-prime-border bg-prime-card px-3 py-2 text-sm text-prime-text hover:border-prime-gold/50"
            target="_blank"
            rel="noopener noreferrer"
          >
            Navegar
          </a>
        ) : null}
      </div>
    </li>
  );
}
