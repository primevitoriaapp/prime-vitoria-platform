"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

const DRIVER_FLOW: TripOperationalStatus[] = [
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed"
];

type Props = {
  devFallbackRole?: "motorista";
};

export function DriverTripsPanel({ devFallbackRole = "motorista" }: Props) {
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
    setLoading(false);
  }, [devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

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
    setMessage(`Estado actualizado: ${STATUS_CORRIDA_PT[to_status]}.`);
    await load();
  }

  const active = trips.filter((t) =>
    ["dispatched", "accepted", "on_the_way", "arrived", "in_progress"].includes(t.operational_status)
  );

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Minhas corridas</h2>
        <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
          Actualizar
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : active.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sem corridas activas atribuídas.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {active.map((trip) => (
            <li key={trip.id} className="py-3">
              <p className="font-medium text-slate-900">
                {STATUS_CORRIDA_PT[trip.operational_status]} ·{" "}
                {new Date(trip.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </p>
              <p className="text-sm text-slate-600">
                {trip.origin_text} → {trip.destination_text}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">{trip.id.slice(0, 8)}…</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {DRIVER_FLOW.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busyTrip === trip.id}
                    onClick={() => void setStatus(trip.id, s)}
                    className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {STATUS_CORRIDA_PT[s]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs">
                <a
                  className="text-amber-800 underline"
                  href={
                    trip.destination_lat != null && trip.destination_lng != null
                      ? `https://www.google.com/maps/dir/?api=1&destination=${trip.destination_lat},${trip.destination_lng}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.destination_text ?? "")}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir no Maps
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
