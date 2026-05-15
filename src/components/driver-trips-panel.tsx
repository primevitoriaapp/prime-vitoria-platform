"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { StatusBadge } from "@/components/status-badge";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { buildGoogleMapsDirectionsUrl, buildWazeNavigateUrl } from "@/lib/trips/driver-nav-links";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import { formatTripKmLine } from "@/lib/trips/format-km";

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

  const load = useCallback(async () => {
    setLoading(true);
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
    setLoading(false);
  }, [devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips"], load);

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

  const active = trips.filter((t) => ACTIVE.includes(t.operational_status));
  const recentHistory = trips
    .filter((t) => HISTORY.includes(t.operational_status))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 10);

  return (
    <>
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Corridas activas</h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-amber-200/90">{message}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">A carregar…</p>
      ) : active.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Sem corridas activas. Novas despachos aparecem aqui com push.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {active.map((trip) => {
            const dest = {
              lat: trip.destination_lat,
              lng: trip.destination_lng,
              label: trip.destination_text
            };
            const waze = buildWazeNavigateUrl(dest);
            const maps = buildGoogleMapsDirectionsUrl(dest);
            const next = driverNextStatuses(trip.operational_status);

            return (
              <li key={trip.id} className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={trip.operational_status} />
                  <span className="font-mono text-xs text-amber-500/80">{trip.id.slice(0, 8)}…</span>
                </div>
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

                <div className="mt-3 flex flex-wrap gap-2">
                  {next.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busyTrip === trip.id}
                      onClick={() => void setStatus(trip.id, s)}
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                      {trip.operational_status === "dispatched" && s === "accepted"
                        ? "Aceitar corrida"
                        : STATUS_CORRIDA_PT[s]}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busyTrip === trip.id}
                    onClick={() => void sendGps(trip)}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Enviar GPS
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <a href={maps} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">
                    Google Maps
                  </a>
                  {waze ? (
                    <a href={waze} className="text-amber-400 hover:underline">
                      Waze
                    </a>
                  ) : null}
                </div>
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
