"use client";

import { FormEvent, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Props = {
  clientId: string;
  costCenters?: { id: string; code: string | null; name: string }[];
};

export function ClientRequestConsole({ clientId, costCenters = [] }: Props) {
  const [serviceType, setServiceType] = useState("Transfer executivo");
  const [scheduledAt, setScheduledAt] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
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
          passenger_name: passengerName || undefined,
          dispatch_mode: "directed"
        })
      },
      "cliente"
    );

    const body = await response.json();
    setLoading(false);
    setMessage(
      response.ok && body.success ? "Solicitação registada. A equipa irá aprovar e despachar." : (body.error?.message ?? "Falha ao solicitar corrida.")
    );
    if (response.ok && body.success) {
      setOrigin("");
      setDestination("");
      setPassengerName("");
    }
  }

  return (
    <section className="card">
      <h2>Nova solicitação corporativa</h2>
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <input
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          placeholder="Tipo de serviço"
          required
          className="sm:col-span-2"
        />
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          required
        />
        {costCenters.length > 0 ? (
          <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className="rounded border border-slate-600 bg-slate-800 px-2 py-1">
            <option value="">Centro de custo (opcional)</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.code ? `${cc.code} · ` : ""}
                {cc.name}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Origem" required />
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destino" required />
        <input
          value={passengerName}
          onChange={(e) => setPassengerName(e.target.value)}
          placeholder="Nome do passageiro"
          className="sm:col-span-2"
        />
        <button type="submit" disabled={loading} className="sm:col-span-2">
          {loading ? "A enviar…" : "Solicitar corrida"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
