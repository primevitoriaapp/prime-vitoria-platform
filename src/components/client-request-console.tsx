"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PassengerAutocompleteInput } from "@/components/passenger-autocomplete-input";
import { DateTimeInput } from "@/components/datetime-input";
import { parseBrDateTimeToIso } from "@/lib/dates/br-date";
import type { EnabledServiceDto } from "@/app/api/clients/[id]/enabled-services/route";
import type { PrimeServiceIcon } from "@/lib/pricing/prime-service-catalog";
import { maxPassengersForService, primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
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

function ServiceIcon({ icon }: { icon: PrimeServiceIcon }) {
  const cls = "h-8 w-8 shrink-0 text-prime-gold";
  if (icon === "van") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M3 8h12v8H3V8zm12 2h4l2 3v3h-6v-6z" strokeLinejoin="round" />
        <circle cx="7" cy="17" r="1.5" fill="currentColor" />
        <circle cx="17" cy="17" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  if (icon === "clock") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "building") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M4 20V6l8-4v18M12 2v18M12 10h8v10" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M5 17h14l-1-7H6l-1 7zM7 10l1-4h8l1 4" strokeLinejoin="round" />
      <circle cx="8" cy="17" r="1.5" fill="currentColor" />
      <circle cx="16" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function ClientRequestConsole({
  clientId,
  costCenters = [],
  devFallbackRole = "cliente"
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [services, setServices] = useState<EnabledServiceDto[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [serviceType, setServiceType] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600_000);
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  });
  const [origin, setOrigin] = useState("");
  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [destination, setDestination] = useState("");
  const [destinationLat, setDestinationLat] = useState<number | null>(null);
  const [destinationLng, setDestinationLng] = useState<number | null>(null);
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [estimate, setEstimate] = useState<{
    hasRule: boolean;
    plannedKm: number | null;
    clientAmount: number | null;
    chargeType?: string;
    pricePerKm?: number | null;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [presets, setPresets] = useState<ClientTripPreset[]>([]);
  const [presetLabel, setPresetLabel] = useState("");

  useEffect(() => {
    setPresets(loadTripPresets(clientId));
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setServicesLoading(true);
      const res = await fetchWithSupabaseSession(
        `/api/clients/${clientId}/enabled-services`,
        {},
        devFallbackRole
      );
      const json = (await res.json()) as { success?: boolean; data?: EnabledServiceDto[] };
      if (!cancelled) {
        setServices(res.ok && json.success ? (json.data ?? []) : []);
        setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, devFallbackRole]);

  function applyPreset(p: ClientTripPreset) {
    setOrigin(p.origin);
    setDestination(p.destination);
    if (p.serviceType) {
      setServiceType(p.serviceType);
      setStep("form");
    }
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

  function pickService(id: string) {
    setServiceType(id);
    setPassengerCount((c) => Math.min(c, maxPassengersForService(id)));
    setStep("form");
    setMessage(null);
  }

  const maxPassengers = serviceType ? maxPassengersForService(serviceType) : 4;
  const hasCoords =
    originLat != null && originLng != null && destinationLat != null && destinationLng != null;

  useEffect(() => {
    if (!serviceType || step !== "form") return;
    const timer = setTimeout(() => {
      void (async () => {
        setEstimateBusy(true);
        const scheduledIso =
          parseBrDateTimeToIso(scheduledAt) ?? new Date(scheduledAt).toISOString();
        const res = await fetchWithSupabaseSession(
          "/api/pricing/estimate-trip",
          {
            method: "POST",
            body: JSON.stringify({
              client_id: clientId,
              service_type: serviceType,
              scheduled_at: scheduledIso,
              origin_lat: originLat,
              origin_lng: originLng,
              destination_lat: destinationLat,
              destination_lng: destinationLng
            })
          },
          devFallbackRole
        );
        const json = (await res.json()) as {
          success?: boolean;
          data?: {
            has_rule?: boolean;
            charge_type?: string;
            price_per_km?: number | null;
            estimate?: { planned_km: number | null; client_amount: number } | null;
          };
        };
        if (!res.ok || !json.success) {
          setEstimate(null);
          setEstimateBusy(false);
          return;
        }
        const hasRule = json.data?.has_rule !== false && json.data?.estimate != null;
        setEstimate({
          hasRule,
          plannedKm: json.data?.estimate?.planned_km ?? null,
          clientAmount: json.data?.estimate?.client_amount ?? null,
          chargeType: json.data?.charge_type,
          pricePerKm: json.data?.price_per_km ?? null
        });
        setEstimateBusy(false);
      })();
    }, 450);
    return () => clearTimeout(timer);
  }, [
    clientId,
    serviceType,
    scheduledAt,
    originLat,
    originLng,
    destinationLat,
    destinationLng,
    step,
    devFallbackRole
  ]);

  const estimateHint = useMemo(() => {
    if (estimateBusy) return "A calcular estimativa…";
    if (!estimate?.hasRule) {
      return hasCoords
        ? "Sem tabela de preços para este serviço — a equipa confirmará o valor."
        : "Selecione origem e destino no mapa para ver distância e estimativa.";
    }
    const parts: string[] = [];
    if (estimate.plannedKm != null) {
      parts.push(`${estimate.plannedKm.toLocaleString("pt-BR")} km`);
    }
    if (estimate.chargeType === "per_km" && estimate.pricePerKm != null) {
      parts.push(
        `${estimate.pricePerKm.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/km`
      );
    }
    if (estimate.clientAmount != null) {
      parts.push(
        `estimado ${estimate.clientAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
      );
    }
    return parts.length ? parts.join(" · ") : "Estimativa disponível após definir rota.";
  }, [estimate, estimateBusy, hasCoords]);

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
          scheduled_at: parseBrDateTimeToIso(scheduledAt) ?? new Date(scheduledAt).toISOString(),
          origin_text: origin,
          origin_lat: originLat,
          origin_lng: originLng,
          destination_text: destination,
          destination_lat: destinationLat,
          destination_lng: destinationLng,
          passenger_name: passengerName || undefined,
          passenger_count: passengerCount,
          notes: notes || undefined,
          dispatch_mode: "directed"
        })
      },
      devFallbackRole
    );

    const body = await response.json();
    setLoading(false);
    setMessage(
      response.ok && body.success
        ? "Solicitação registada com status Solicitada. A equipa irá aprovar e despachar."
        : (body.error?.message ?? "Falha ao solicitar corrida.")
    );
    if (response.ok && body.success) {
      setPassengerName("");
      setNotes("");
      setStep("pick");
      setServiceType("");
      router.refresh();
    }
  }

  if (servicesLoading) {
    return (
      <section className="card">
        <p className="text-sm text-prime-muted">A carregar serviços disponíveis…</p>
      </section>
    );
  }

  if (services.length === 0) {
    return (
      <section className="card">
        <h2 className="font-serif text-lg text-prime-text">Nova solicitação</h2>
        <p className="mt-2 text-sm text-prime-muted">
          Nenhum serviço habilitado para esta conta. Contacte a Prime Vitória para activar os serviços
          contratados.
        </p>
      </section>
    );
  }

  if (step === "pick") {
    return (
      <section className="card">
        <h2 className="font-serif text-lg text-prime-text">Escolha o tipo de serviço</h2>
        <p className="mt-1 text-sm text-prime-muted">Seleccione o serviço contratado para esta solicitação.</p>

        {presets.length > 0 ? (
          <div className="mb-4 mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-prime-muted">Rotas rápidas</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-prime-border bg-white shadow-prime-card"
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="px-2 py-1 text-sm font-medium text-prime-gold hover:underline"
                  >
                    {p.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemovePreset(p.id)}
                    className="px-1.5 py-1 text-xs text-prime-muted hover:text-red-700"
                    aria-label={`Remover ${p.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => pickService(s.id)}
                className="flex w-full items-start gap-3 rounded-lg border border-prime-border bg-white p-4 text-left shadow-prime-card transition hover:border-prime-gold"
              >
                <ServiceIcon icon={s.icon} />
                <span>
                  <span className="block font-medium text-prime-text">{s.label}</span>
                  <span className="mt-1 block text-sm text-prime-muted">{s.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const selectedLabel = primeServiceTypeLabel(serviceType, { audience: "client" });

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg text-prime-text">{selectedLabel}</h2>
        <button
          type="button"
          className="text-sm text-prime-gold hover:underline"
          onClick={() => {
            setStep("pick");
            setMessage(null);
          }}
        >
          ← Trocar serviço
        </button>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <DateTimeInput
          className={`sm:col-span-2 ${PRIME_INPUT_CLASS}`}
          value={scheduledAt}
          onChange={(iso) => setScheduledAt(iso ?? "")}
          required
        />
        {costCenters.length > 0 ? (
          <select
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
            className={PRIME_INPUT_CLASS}
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
        <AddressAutocompleteInput
          className="sm:col-span-2"
          label="Origem"
          required
          placeholder="Ex.: Aeroporto de Vitória ES"
          value={origin}
          hasCoords={originLat != null && originLng != null}
          onChange={setOrigin}
          onPlaceSelect={(place) => {
            setOrigin(place.displayName);
            setOriginLat(place.lat);
            setOriginLng(place.lng);
          }}
          onCoordsClear={() => {
            setOriginLat(null);
            setOriginLng(null);
          }}
        />
        <AddressAutocompleteInput
          className="sm:col-span-2"
          label="Destino"
          required
          placeholder="Ex.: Shopping Vitória ES"
          value={destination}
          hasCoords={destinationLat != null && destinationLng != null}
          onChange={setDestination}
          onPlaceSelect={(place) => {
            setDestination(place.displayName);
            setDestinationLat(place.lat);
            setDestinationLng(place.lng);
          }}
          onCoordsClear={() => {
            setDestinationLat(null);
            setDestinationLng(null);
          }}
        />
        <label className="grid gap-1 text-sm">
          <span>Número de passageiros</span>
          <input
            type="number"
            min={1}
            max={maxPassengers}
            required
            className={PRIME_INPUT_CLASS}
            value={passengerCount}
            onChange={(e) =>
              setPassengerCount(Math.min(maxPassengers, Math.max(1, Number(e.target.value) || 1)))
            }
          />
        </label>
        <PassengerAutocompleteInput
          clientId={clientId}
          value={passengerName}
          onChange={setPassengerName}
          onSelect={(p) => {
            setPassengerName(p.name);
            if (p.phone) setPassengerPhone(p.phone);
            const addr = p.address?.trim();
            if (addr) {
              if (!origin.trim()) setOrigin(addr);
              else if (!destination.trim()) setDestination(addr);
            }
          }}
          devFallbackRole={devFallbackRole}
        />
        <input
          className={PRIME_INPUT_CLASS}
          type="tel"
          value={passengerPhone}
          onChange={(e) => setPassengerPhone(e.target.value)}
          placeholder="Telefone do passageiro"
        />
        <div className="sm:col-span-2 rounded-lg border border-prime-border bg-white px-3 py-2 text-sm text-prime-muted shadow-prime-card">
          <span className="font-medium text-prime-text">Estimativa: </span>
          {estimateHint}
        </div>
        <textarea
          className={`sm:col-span-2 ${PRIME_INPUT_CLASS}`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observações (opcional)"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <input
            value={presetLabel}
            onChange={(e) => setPresetLabel(e.target.value)}
            placeholder="Nome da rota (opcional)"
            className={`min-w-[140px] flex-1 ${PRIME_INPUT_CLASS}`}
          />
          <button type="button" onClick={onSavePreset} className="btn-outline text-sm">
            Guardar rota
          </button>
        </div>
        <button type="submit" disabled={loading} className="btn-primary sm:col-span-2">
          {loading ? "A enviar…" : "Enviar solicitação"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-prime-muted">{message}</p> : null}
    </section>
  );
}
