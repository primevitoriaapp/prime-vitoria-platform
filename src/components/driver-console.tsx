"use client";

import { FormEvent, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

const nextStatuses = ["accepted", "on_the_way", "arrived", "in_progress", "completed"];

export function DriverConsole() {
  const [tripId, setTripId] = useState("");
  const [status, setStatus] = useState(nextStatuses[0]);
  const [lat, setLat] = useState("-20.3155");
  const [lng, setLng] = useState("-40.3128");
  const [message, setMessage] = useState<string | null>(null);

  async function onUpdateStatus(event: FormEvent) {
    event.preventDefault();
    const response = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/status`,
      {
        method: "POST",
        body: JSON.stringify({ to_status: status })
      },
      "motorista"
    );
    const body = await response.json();
    setMessage(response.ok && body.success ? "Status atualizado." : (body.error?.message ?? "Falha ao atualizar status."));
  }

  async function onLocation(event: FormEvent) {
    event.preventDefault();
    const response = await fetchWithSupabaseSession(
      "/api/drivers/location",
      {
        method: "POST",
        body: JSON.stringify({
          driver_id: "00000000-0000-0000-0000-000000000001",
          trip_id: tripId || undefined,
          lat: Number(lat),
          lng: Number(lng),
          recorded_at: new Date().toISOString()
        })
      },
      "motorista"
    );
    const body = await response.json();
    setMessage(response.ok && body.success ? "Localização enviada." : (body.error?.message ?? "Falha ao enviar localização."));
  }

  return (
    <section className="card">
      <h2>Operação do motorista</h2>
      <form onSubmit={onUpdateStatus} className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <input value={tripId} onChange={(event) => setTripId(event.target.value)} placeholder="ID da corrida" required />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {nextStatuses.map((item) => (
            <option value={item} key={item}>
              {STATUS_CORRIDA_PT[item as TripOperationalStatus]}
            </option>
          ))}
        </select>
        <button type="submit">Atualizar status</button>
      </form>
      <form onSubmit={onLocation} className="grid" style={{ marginTop: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <input value={lat} onChange={(event) => setLat(event.target.value)} placeholder="Latitude" />
        <input value={lng} onChange={(event) => setLng(event.target.value)} placeholder="Longitude" />
        <button type="submit">Enviar localização</button>
      </form>
      {message ? <p>{message}</p> : null}
    </section>
  );
}
