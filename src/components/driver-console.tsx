"use client";

import { FormEvent, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

const DRIVER_FLOW: TripOperationalStatus[] = [
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed"
];

export function DriverConsole() {
  const [tripId, setTripId] = useState("");
  const [status, setStatus] = useState<TripOperationalStatus>("accepted");
  const [lat, setLat] = useState("-20.3155");
  const [lng, setLng] = useState("-40.3128");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function setTripStatus(next: TripOperationalStatus) {
    if (!tripId.trim()) {
      setMessage("Informe o ID da corrida.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const response = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/status`,
      { method: "POST", body: JSON.stringify({ to_status: next }) },
      "motorista"
    );
    const body = await response.json();
    setLoading(false);
    if (response.ok && body.success) {
      setStatus(next);
      setMessage(`Estado: ${STATUS_CORRIDA_PT[next]}.`);
      return;
    }
    setMessage(body.error?.message ?? "Falha ao atualizar status.");
  }

  async function onUpdateStatus(event: FormEvent) {
    event.preventDefault();
    await setTripStatus(status);
  }

  async function onLocation(event: FormEvent) {
    event.preventDefault();
    const response = await fetchWithSupabaseSession(
      "/api/drivers/location",
      {
        method: "POST",
        body: JSON.stringify({
          trip_id: tripId || undefined,
          lat: Number(lat),
          lng: Number(lng),
          recorded_at: new Date().toISOString()
        })
      },
      "motorista"
    );
    const body = await response.json();
    setMessage(
      response.ok && body.success ? "Localização enviada." : (body.error?.message ?? "Falha ao enviar localização.")
    );
  }

  return (
    <section className="card">
      <h2>Operação do motorista</h2>
      <p className="mb-3 text-sm text-slate-600">Fluxo: aceite → a caminho → chegou → em curso → concluída (recalcula KM ao concluir).</p>
      <input
        value={tripId}
        onChange={(event) => setTripId(event.target.value)}
        placeholder="ID da corrida"
        className="mb-3 w-full max-w-md rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {DRIVER_FLOW.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading}
            onClick={() => void setTripStatus(s)}
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {STATUS_CORRIDA_PT[s]}
          </button>
        ))}
      </div>
      <form onSubmit={(e) => void onUpdateStatus(e)} className="grid gap-2 sm:grid-cols-2">
        <select value={status} onChange={(event) => setStatus(event.target.value as TripOperationalStatus)}>
          {DRIVER_FLOW.map((item) => (
            <option value={item} key={item}>
              {STATUS_CORRIDA_PT[item]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading}>
          Actualizar status
        </button>
      </form>
      <form onSubmit={(e) => void onLocation(e)} className="mt-4 grid gap-2 sm:grid-cols-2">
        <input value={lat} onChange={(event) => setLat(event.target.value)} placeholder="Latitude" />
        <input value={lng} onChange={(event) => setLng(event.target.value)} placeholder="Longitude" />
        <button type="submit">Enviar localização (trail KM)</button>
      </form>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
