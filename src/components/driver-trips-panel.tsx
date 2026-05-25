"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { StatusBadge } from "@/components/status-badge";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { buildDriverNavigationLinks } from "@/lib/trips/driver-nav-links";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import { confirmDriverStatusTransition } from "@/lib/trips/driver-status-confirm";
import { formatTripKmLine } from "@/lib/trips/format-km";
import { DriverTripSkeleton } from "@/components/driver-trip-skeleton";
import { DriverOperationalTimeline } from "@/components/driver-operational-timeline";
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

type Props = {
  tenantId?: string | null;
  devFallbackRole?: "motorista";
};

export function DriverTripsPanel({ tenantId = null, devFallbackRole = "motorista" }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const docVisible = useDocumentVisible();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const res = await fetchWithSupabaseSession("/api/trips?page=1&pageSize=30", {}, devFallbackRole);
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
  }, [devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!docVisible) return;
    const timer = setInterval(() => void load({ silent: true }), 20_000);
    return () => clearInterval(timer);
  }, [load, docVisible]);

  useTenantTableRefresh(tenantId, ["trips", "dispatch_offers"], load);

  useDriverPushRefresh(
    () => void load({ silent: trips.length > 0 }),
    (detail) => {
      const label = detail.title ?? detail.body ?? "Nova actualização";
      setMessage(label);
    }
  );

  async function setStatus(tripId: string, to_status: TripOperationalStatus) {
    if (!confirmDriverStatusTransition(to_status)) return;
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

  const active = trips.filter((t) => ACTIVE.includes(t.operational_status));
  const recentHistory = trips
    .filter((t) => HISTORY.includes(t.operational_status))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 10);

  return (
    <>
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white md:text-xl">Corridas activas</h2>
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
              Lista: {lastRefreshAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
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
          Sem corridas activas. Após despacho, toque em <strong className="text-slate-400">Actualizar</strong> ou aguarde
          notificação push (quando FCM estiver activo).
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {active.map((trip) => {
            const dest = {
              lat: trip.destination_lat,
              lng: trip.destination_lng,
              label: trip.destination_text
            };
            const navLinks = buildDriverNavigationLinks({
              origin: { lat: trip.origin_lat, lng: trip.origin_lng, label: trip.origin_text },
              destination: dest
            });
            const primaryNav = navLinks.find((l) => l.id === "waze") ?? navLinks[0];
            const next = driverNextStatuses(trip.operational_status);
            const primaryStep = next[0];
            const extraSteps = next.slice(1);
            const isBusy = busyTrip === trip.id;

            return (
              <li
                key={trip.id}
                data-driver-trip-id={trip.id}
                className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 md:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={trip.operational_status} />
                  <span className="font-mono text-xs text-amber-500/80">{trip.id.slice(0, 8)}…</span>
                </div>
                <DriverOperationalTimeline current={trip.operational_status} />
                <p className="mt-2 text-sm font-medium text-white">
                  {trip.passenger_name?.trim() || "Passageiro"}
                  {trip.service_type ? <span className="text-slate-500"> · {trip.service_type}</span> : null}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {trip.origin_text} → {trip.destination_text}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(trip.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  {trip.vehicle ? (
                    <span className="ml-2 text-amber-400/90">
                      · {trip.vehicle.plate} ({trip.vehicle.model})
                    </span>
                  ) : null}
                </p>
                {(() => {
                  const km = formatTripKmLine(trip);
                  return km ? <p className="mt-1 text-xs text-slate-500">{km}</p> : null;
                })()}

                {primaryNav ? (
                  <a
                    href={primaryNav.href}
                    target={primaryNav.id === "waze" ? undefined : "_blank"}
                    rel={primaryNav.id === "waze" ? undefined : "noopener noreferrer"}
                    className="mt-4 flex min-h-[3rem] w-full items-center justify-center rounded-xl border-2 border-sky-500/80 bg-sky-950/40 px-4 py-3 text-base font-semibold text-sky-200 hover:bg-sky-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 md:min-h-[3.25rem] md:text-lg"
                  >
                    Navegar — {primaryNav.label}
                  </a>
                ) : null}

                <div className="mt-3 flex flex-col gap-2">
                  {primaryStep ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-busy={isBusy}
                      onClick={() => void setStatus(trip.id, primaryStep)}
                      className="min-h-[3.25rem] w-full rounded-xl bg-amber-500 px-4 py-3 text-lg font-bold text-slate-950 hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-60 md:min-h-[3.5rem]"
                    >
                      {isBusy
                        ? "A processar…"
                        : trip.operational_status === "dispatched" && primaryStep === "accepted"
                          ? "Aceitar corrida"
                          : STATUS_CORRIDA_PT[primaryStep]}
                    </button>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void sendGps(trip)}
                      className="min-h-[2.75rem] flex-1 rounded-xl border border-slate-600 px-4 py-2.5 text-base text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:opacity-50 md:min-h-[3rem]"
                    >
                      Enviar GPS
                    </button>
                  </div>
                  {extraSteps.length > 0 ? (
                    <details className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-2">
                      <summary className="cursor-pointer px-2 py-1 text-sm text-slate-400">
                        Outros passos ({extraSteps.length})
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {extraSteps.map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={isBusy}
                            onClick={() => void setStatus(trip.id, s)}
                            className="min-h-[2.5rem] rounded-lg border border-amber-600/50 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-950/40 disabled:opacity-50"
                          >
                            {STATUS_CORRIDA_PT[s]}
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>

                <details className="mt-3 rounded-lg border border-slate-800/80 bg-slate-900/40 p-2">
                  <summary className="cursor-pointer px-2 py-1 text-sm font-medium text-amber-400 hover:text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
                    Abrir navegação (Maps / Waze / Apple)
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {navLinks.map((link) => (
                      <a
                        key={link.id}
                        href={link.href}
                        target={link.id === "waze" ? undefined : "_blank"}
                        rel={link.id === "waze" ? undefined : "noopener noreferrer"}
                        className="text-amber-400 hover:underline"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
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
                  {new Date(trip.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                {trip.origin_text} → {trip.destination_text}
              </p>
              {(() => {
                const km = formatTripKmLine(trip);
                return km ? <p className="mt-1 text-xs text-slate-500">{km}</p> : null;
              })()}
            </li>
          ))}
        </ul>
      </details>
    ) : null}
    </>
  );
}
