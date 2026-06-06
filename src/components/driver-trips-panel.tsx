"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { clearDriverTabAlertBadge, notifyDriverNewAssignment } from "@/lib/client/driver-alert-notify";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { driverPrimaryActionLabel } from "@/lib/trips/driver-step-copy";
import { StatusBadge } from "@/components/status-badge";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { buildDriverNavigationLinks } from "@/lib/trips/driver-nav-links";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import { confirmDriverStatusTransition } from "@/lib/trips/driver-status-confirm";
import { buildNavigationLinksToPoint } from "@/lib/trips/driver-nav-links";
import { pickDriverFocusTripId } from "@/lib/trips/driver-step-copy";
import { formatTripKmLine } from "@/lib/trips/format-km";
import { DriverTripSkeleton } from "@/components/driver-trip-skeleton";
import { DriverActiveTripHero } from "@/components/driver-active-trip-hero";
import { DriverNewTripBanner } from "@/components/driver-new-trip-banner";
import { TripLegLabelBadge } from "@/components/trip-leg-label-badge";
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
const ALERT_STATUSES: TripOperationalStatus[] = ["dispatched", "accepted", "approved"];

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
  const [newTripBanner, setNewTripBanner] = useState<{ origin: string; destination: string } | null>(null);
  const [waitBusy, setWaitBusy] = useState(false);
  const [waitTick, setWaitTick] = useState(0);
  const docVisible = useDocumentVisible();
  const knownTripIdsRef = useRef<Set<string>>(new Set());
  const tripsInitializedRef = useRef(false);

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
    const items = json.data?.items ?? [];
    const newAssignments = items.filter(
      (t) => !knownTripIdsRef.current.has(t.id) && ALERT_STATUSES.includes(t.operational_status)
    );
    if (tripsInitializedRef.current && newAssignments.length > 0) {
      const first = newAssignments[0]!;
      setNewTripBanner({
        origin: first.origin_text?.trim() || "Origem",
        destination: first.destination_text?.trim() || "Destino"
      });
      notifyDriverNewAssignment("trip");
    }
    knownTripIdsRef.current = new Set(items.map((t) => t.id));
    tripsInitializedRef.current = true;
    setTrips(items);
    setMessage(null);
    setLastRefreshAt(new Date());
    setLoading(false);
  }, [devFallbackRole, driverIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () =>
      trips
        .filter((t) => ACTIVE.includes(t.operational_status))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [trips]
  );
  const primaryId = useMemo(() => pickDriverFocusTripId(active), [active]);
  const primaryTrip = active.find((t) => t.id === primaryId) ?? null;
  const otherActive = active.filter((t) => t.id !== primaryId);

  useEffect(() => {
    if (docVisible) clearDriverTabAlertBadge();
  }, [docVisible]);

  const waitingTrip = active.find((trip) => trip.wait_started_at) ?? null;
  useEffect(() => {
    if (!waitingTrip?.wait_started_at) return;
    const timer = setInterval(() => setWaitTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [waitingTrip?.id, waitingTrip?.wait_started_at]);

  const waitElapsedLabel = useMemo(() => {
    void waitTick;
    const started = waitingTrip?.wait_started_at;
    if (!started) return null;
    const ms = Math.max(0, Date.now() - new Date(started).getTime());
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [waitingTrip?.wait_started_at, waitTick]);

  const waitElapsedLabelForTrip = useCallback(
    (trip: Trip) => {
      void waitTick;
      if (!trip.wait_started_at) return null;
      const ms = Math.max(0, Date.now() - new Date(trip.wait_started_at).getTime());
      const totalSec = Math.floor(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },
    [waitTick]
  );

  useEffect(() => {
    if (!docVisible) return;
    const timer = setInterval(() => void load({ silent: true }), 15_000);
    return () => clearInterval(timer);
  }, [load, docVisible]);

  useTenantTableRefresh(tenantId, ["trips", "dispatch_offers"], () => void load({ silent: active.length > 0 }));

  useDriverPushRefresh(
    () => void load({ silent: trips.length > 0 }),
    () => {
      notifyDriverNewAssignment("trip");
      void load({ silent: true });
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

  async function setWait(tripId: string, action: "start" | "stop") {
    setWaitBusy(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/wait`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setWaitBusy(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao registar espera.");
      return;
    }
    if (action === "stop") {
      setMessage("Tempo de espera registado.");
    }
    await load({ silent: true });
  }

  async function setStatus(tripId: string, to_status: TripOperationalStatus) {
    const trip = trips.find((item) => item.id === tripId);
    if (to_status === "in_progress" && trip?.wait_started_at) {
      await setWait(tripId, "stop");
    }
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
      {newTripBanner ? (
        <DriverNewTripBanner
          origin={newTripBanner.origin}
          destination={newTripBanner.destination}
          onDismiss={() => setNewTripBanner(null)}
        />
      ) : null}
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
                {active.length > 0 ? "Auto 15s · " : "Auto 15s · "}
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
            Sem corrida actual. Após despacho da central, a corrida aparece aqui — actualização automática a cada 15s
            (ou notificação push quando activa).
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-slate-300">Ordem do dia (mais cedo primeiro)</h3>
              <ol className="mt-2 space-y-2">
                {active.map((trip, index) => (
                  <DriverTripScheduleRow
                    key={trip.id}
                    trip={trip}
                    position={index + 1}
                    isFocus={trip.id === primaryId}
                    waitLabel={trip.wait_started_at ? waitElapsedLabelForTrip(trip) : null}
                  />
                ))}
              </ol>
            </div>

            {primaryTrip ? (
              <DriverActiveTripHero
                trip={primaryTrip}
                isBusy={busyTrip === primaryTrip.id}
                highlighted={highlightTripId === primaryTrip.id}
                waitElapsedLabel={primaryTrip.wait_started_at ? waitElapsedLabel : null}
                waitBusy={waitBusy}
                onStatus={setStatus}
                onGps={sendGps}
                onWaitStart={(id) => void setWait(id, "start")}
                onWaitStop={(id) => void setWait(id, "stop")}
              />
            ) : null}

            {otherActive.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-slate-400">Acções rápidas ({otherActive.length})</h3>
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
                <p className="mt-1 min-w-0 text-sm text-slate-400">
                  <span className="block truncate" title={trip.origin_text ?? ""}>
                    {trip.origin_text}
                  </span>
                  <span className="block truncate" title={trip.destination_text ?? ""}>
                    → {trip.destination_text}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function formatTripScheduleLabel(scheduledAt: string | null | undefined): string {
  if (!scheduledAt?.trim()) return "Horário a definir";
  const full = formatBrDateTime(scheduledAt);
  if (full) return full;
  const d = new Date(scheduledAt);
  return Number.isNaN(d.getTime()) ? "Horário a definir" : formatBrDateTime(d.toISOString());
}

function DriverTripScheduleRow({
  trip,
  position,
  isFocus,
  waitLabel
}: {
  trip: Trip;
  position: number;
  isFocus: boolean;
  waitLabel: string | null;
}) {
  const scheduleLabel = formatTripScheduleLabel(trip.scheduled_at);
  const passenger = trip.passenger_name?.trim() || "Passageiro";
  const origin = trip.origin_text?.trim() || "Origem";
  const destination = trip.destination_text?.trim() || "Destino";

  return (
    <li
      data-driver-trip-id={trip.id}
      className={[
        "rounded-xl border px-3 py-3",
        isFocus ? "border-prime-gold/50 bg-prime-gold/10" : "border-slate-700 bg-slate-900/50"
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">
          {position}
        </span>
        <span className="font-mono text-sm font-semibold text-white">{scheduleLabel}</span>
        <StatusBadge status={trip.operational_status} />
        <TripLegLabelBadge label={trip.trip_leg_label} />
        {isFocus ? <span className="text-[10px] font-semibold uppercase tracking-wide text-prime-gold">Em foco</span> : null}
        {waitLabel ? (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-200">
            Espera {waitLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-100">{passenger}</p>
      <p className="mt-1 text-sm text-slate-400">
        <span className="block truncate" title={origin}>
          {origin}
        </span>
        <span className="block truncate" title={destination}>
          → {destination}
        </span>
      </p>
    </li>
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
  const pickupNav =
    buildNavigationLinksToPoint({
      lat: trip.origin_lat,
      lng: trip.origin_lng,
      label: trip.origin_text
    }).find((link) => link.id === "waze") ??
    buildNavigationLinksToPoint({
      lat: trip.origin_lat,
      lng: trip.origin_lng,
      label: trip.origin_text
    })[0];
  const scheduleLabel = formatTripScheduleLabel(trip.scheduled_at);

  return (
    <li
      data-driver-trip-id={trip.id}
      className="prime-driver-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-prime-gold">{scheduleLabel}</span>
        <StatusBadge status={trip.operational_status} />
        <TripLegLabelBadge label={trip.trip_leg_label} />
      </div>
      <p className="mt-2 text-sm font-medium text-prime-text">{trip.passenger_name ?? "Passageiro"}</p>
      <p className="mt-1 text-sm text-prime-muted">
        <span className="block truncate" title={trip.origin_text ?? ""}>
          {trip.origin_text ?? "—"}
        </span>
        <span className="block truncate" title={trip.destination_text ?? ""}>
          → {trip.destination_text ?? "—"}
        </span>
      </p>
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
        {pickupNav && trip.operational_status !== "in_progress" ? (
          <a
            href={pickupNav.href}
            className="rounded-lg border border-prime-gold/40 bg-prime-gold/10 px-3 py-2 text-sm font-medium text-prime-text hover:border-prime-gold/60"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ir até o cliente
          </a>
        ) : null}
      </div>
    </li>
  );
}
