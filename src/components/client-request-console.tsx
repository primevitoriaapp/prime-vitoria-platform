"use client";

import { FormEvent, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

export function ClientRequestConsole() {
  const [clientId, setClientId] = useState("");
  const [serviceType, setServiceType] = useState("corporativo");
  const [scheduledAt, setScheduledAt] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await fetchWithSupabaseSession(
      "/api/trips",
      {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId,
          cost_center_id: costCenterId || undefined,
          service_type: serviceType,
          scheduled_at: new Date(scheduledAt).toISOString(),
          origin_text: origin,
          destination_text: destination,
          dispatch_mode: "directed"
        })
      },
      "cliente"
    );

    const body = await response.json();
    setMessage(response.ok && body.success ? "Solicitacao registrada." : (body.error?.message ?? "Falha ao solicitar corrida."));
  }

  return (
    <section className="card">
      <h2>Nova solicitacao corporativa</h2>
      <form onSubmit={onSubmit} className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Client ID" required />
        <input value={costCenterId} onChange={(event) => setCostCenterId(event.target.value)} placeholder="Cost center ID" />
        <input value={serviceType} onChange={(event) => setServiceType(event.target.value)} placeholder="Tipo de servico" />
        <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
        <input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Origem" required />
        <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Destino" required />
        <button type="submit">Solicitar corrida</button>
      </form>
      {message ? <p>{message}</p> : null}
    </section>
  );
}
