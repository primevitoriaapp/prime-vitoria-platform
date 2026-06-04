"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import {
  loadTripPresets,
  removeTripPreset,
  upsertTripPreset,
  type ClientTripPreset
} from "@/lib/client/trip-presets";

type Props = {
  clientId: string;
  costCenters?: { id: string; code: string | null; name: string }[];
  devFallbackRole?: "cliente" | "admin";
};

export function ClientRequestConsole({
  clientId,
  costCenters = [],
  devFallbackRole = "cliente"
}: Props) {
  const router = useRouter();
  const [serviceType, setServiceType] = useState("Transfer executivo");
  const [scheduledAt, setScheduledAt] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [presets, setPresets] = useState<ClientTripPreset[]>([]);
  const [presetLabel, setPresetLabel] = useState("");

  useEffect(() => {
    setPresets(loadTripPresets(clientId));
  }, [clientId]);

  function applyPreset(p: ClientTripPreset) {
    setOrigin(p.origin);
    setDestination(p.destination);
    if (p.serviceType) setServiceType(p.serviceType);
    setMessage(`Rota «${p.label}» aplicada.`);
  }

  function onSavePreset() {
    if (!origin.trim() || !destination.trim()) {
      setMessage("Preencha origem e destino antes de guardar a rota.");
      return;
    }
    const label = presetLabel.trim() || `${origin.slice(0, 24)} → ${destination.slice(0, 24)}`;
    const next = upsertTripPreset(clientId, {
      label,
      origin,
      destination,
      serviceType
    });
    setPresets(next);
    setPresetLabel("");
    setMessage(`Rota «${label}» guardada neste dispositivo.`);
  }

  function onRemovePreset(id: string) {
    setPresets(removeTripPreset(clientId, id));
  }

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
      devFallbackRole
    );

    const body = await response.json();
    setLoading(false);
    setMessage(
      response.ok && body.success
        ? "Solicitação registada. A equipa irá aprovar e despachar."
        : (body.error?.message ?? "Falha ao solicitar corrida.")
    );
    if (response.ok && body.success) {
      setPassengerName("");
      router.refresh();
    }
  }

  return (
    <section className="card">
      <h2>Nova solicitação corporativa</h2>

      {presets.length > 0 ? (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Rotas rápidas</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800/80">
                <button
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-2 py-1 text-sm text-amber-400 hover:text-amber-300"
                >
                  {p.label}
                </button>
                <button
                  type="button"
                  onClick={() => onRemovePreset(p.id)}
                  className="px-1.5 py-1 text-xs text-slate-500 hover:text-red-400"
                  aria-label={`Remover ${p.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

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
          <select
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1"
          >
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
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <input
            value={presetLabel}
            onChange={(e) => setPresetLabel(e.target.value)}
            placeholder="Nome da rota (opcional)"
            className="min-w-[140px] flex-1"
          />
          <button type="button" onClick={onSavePreset} className="rounded-lg border border-slate-600 px-3 py-1 text-sm">
            Guardar rota
          </button>
        </div>
        <button type="submit" disabled={loading} className="sm:col-span-2">
          {loading ? "A enviar…" : "Solicitar corrida"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  );
}
