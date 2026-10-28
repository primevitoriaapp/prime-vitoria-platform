"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PassengerAutocompleteInput } from "@/components/passenger-autocomplete-input";
import { formatBrDateTime, saoPauloDateAndTimeToUtcIso, saoPauloTodayYmd } from "@/lib/dates/br-date";
import type { EnabledServiceDto } from "@/app/api/clients/[id]/enabled-services/route";
import type { PrimeServiceIcon } from "@/lib/pricing/prime-service-catalog";
import { maxPassengersForService, primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { shortAddress } from "@/lib/client/short-address";
import {
  loadTripPresets,
  removeTripPreset,
  upsertTripPreset,
  type ClientTripPreset
} from "@/lib/client/trip-presets";

type Props = {
  clientId: string;
  clientName?: string;
  costCenters?: { id: string; code: string | null; name: string }[];
  devFallbackRole?: "cliente" | "admin";
  /** Funcionário solicitante: o passageiro já vem com o nome dele. */
  defaultPassengerName?: string;
  onCreated?: () => void;
};

const FIELD =
  "w-full rounded-lg border border-prime-input-border bg-white px-3 py-2.5 text-base text-prime-text outline-none focus:border-prime-gold focus:ring-2 focus:ring-prime-gold/25";
const LABEL = "grid gap-1.5 text-sm font-medium text-prime-text";

function ServiceIcon({ icon }: { icon: PrimeServiceIcon }) {
  const cls = "h-7 w-7 shrink-0";
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

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-prime-text">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#111] text-xs text-prime-gold">{n}</span>
      {children}
    </h3>
  );
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Created = { when: string; origin: string; destination: string; service: string; passenger: string };

export function ClientRequestConsole({
  clientId,
  clientName,
  costCenters = [],
  devFallbackRole = "cliente",
  defaultPassengerName = "",
  onCreated
}: Props) {
  const router = useRouter();
  const [services, setServices] = useState<EnabledServiceDto[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [serviceType, setServiceType] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [origin, setOrigin] = useState("");
  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [destination, setDestination] = useState("");
  const [destinationLat, setDestinationLat] = useState<number | null>(null);
  const [destinationLng, setDestinationLng] = useState<number | null>(null);
  const [passengerName, setPassengerName] = useState(defaultPassengerName);
  const [passengerPhone, setPassengerPhone] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [estimate, setEstimate] = useState<{
    hasRule: boolean;
    plannedKm: number | null;
    clientAmount: number | null;
    chargeType?: string;
    pricePerKm?: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [presets, setPresets] = useState<ClientTripPreset[]>([]);

  useEffect(() => {
    setPresets(loadTripPresets(clientId));
  }, [clientId]);

  useEffect(() => {
    setPassengerName((cur) => cur || defaultPassengerName);
  }, [defaultPassengerName]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setServicesLoading(true);
      const res = await fetchWithSupabaseSession(`/api/clients/${clientId}/enabled-services`, {}, devFallbackRole);
      const json = (await res.json()) as { success?: boolean; data?: EnabledServiceDto[] };
      if (!cancelled) {
        const list = res.ok && json.success ? (json.data ?? []) : [];
        setServices(list);
        if (list.length === 1) setServiceType(list[0].id);
        setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, devFallbackRole]);

  const scheduledIso = useMemo(() => (date && time ? saoPauloDateAndTimeToUtcIso(date, time) : null), [date, time]);
  const maxPassengers = serviceType ? maxPassengersForService(serviceType) : 4;
  const hasCoords = originLat != null && originLng != null && destinationLat != null && destinationLng != null;

  useEffect(() => {
    if (!serviceType) return;
    const timer = setTimeout(() => {
      void (async () => {
        setEstimateBusy(true);
        const res = await fetchWithSupabaseSession(
          "/api/pricing/estimate-trip",
          {
            method: "POST",
            body: JSON.stringify({
              client_id: clientId,
              service_type: serviceType,
              scheduled_at: scheduledIso ?? undefined,
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
        } else {
          setEstimate({
            hasRule: json.data?.has_rule !== false && json.data?.estimate != null,
            plannedKm: json.data?.estimate?.planned_km ?? null,
            clientAmount: json.data?.estimate?.client_amount ?? null,
            chargeType: json.data?.charge_type,
            pricePerKm: json.data?.price_per_km ?? null
          });
        }
        setEstimateBusy(false);
      })();
    }, 450);
    return () => clearTimeout(timer);
  }, [clientId, serviceType, scheduledIso, originLat, originLng, destinationLat, destinationLng, devFallbackRole]);

  function applyPreset(p: ClientTripPreset) {
    setOrigin(p.origin);
    setDestination(p.destination);
    setOriginLat(null);
    setOriginLng(null);
    setDestinationLat(null);
    setDestinationLng(null);
    if (p.serviceType) setServiceType(p.serviceType);
  }

  function saveCurrentRoute() {
    if (!origin.trim() || !destination.trim()) return;
    const label = `${shortAddress(origin).slice(0, 22)} → ${shortAddress(destination).slice(0, 22)}`;
    setPresets(upsertTripPreset(clientId, { label, origin, destination, serviceType }));
  }

  function reset() {
    setCreated(null);
    setDate("");
    setTime("");
    setOrigin("");
    setDestination("");
    setOriginLat(null);
    setOriginLng(null);
    setDestinationLat(null);
    setDestinationLng(null);
    setNotes("");
    setPassengerName(defaultPassengerName);
    setPassengerPhone("");
    setPassengerCount(1);
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!serviceType) {
      setError("Escolha o tipo de serviço.");
      return;
    }
    if (!scheduledIso) {
      setError("Informe a data e o horário da corrida.");
      return;
    }
    if (new Date(scheduledIso).getTime() < Date.now() + 5 * 60_000) {
      setError("O horário precisa ser no futuro. Para uma corrida imediata, ligue para a central Prime.");
      return;
    }
    if (!origin.trim() || !destination.trim()) {
      setError("Informe o local de embarque e o destino.");
      return;
    }
    setLoading(true);
    const response = await fetchWithSupabaseSession(
      "/api/trips",
      {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId,
          cost_center_id: costCenterId || undefined,
          service_type: serviceType,
          scheduled_at: scheduledIso,
          origin_text: origin,
          origin_lat: originLat,
          origin_lng: originLng,
          destination_text: destination,
          destination_lat: destinationLat,
          destination_lng: destinationLng,
          passenger_name: passengerName || undefined,
          passenger_phone: passengerPhone || undefined,
          passenger_count: passengerCount,
          notes: notes || undefined,
          dispatch_mode: "directed"
        })
      },
      devFallbackRole
    );
    const body = (await response.json()) as { success?: boolean; error?: { message?: string } };
    setLoading(false);
    if (!response.ok || !body.success) {
      setError(body.error?.message ?? "Não foi possível enviar o pedido. Tente de novo.");
      return;
    }
    saveCurrentRoute();
    setCreated({
      when: formatBrDateTime(scheduledIso),
      origin: shortAddress(origin),
      destination: shortAddress(destination),
      service: primeServiceTypeLabel(serviceType, { audience: "client" }),
      passenger: passengerName.trim() || "A definir"
    });
    onCreated?.();
    router.refresh();
  }

  if (servicesLoading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-prime-border bg-white" />;
  }

  if (services.length === 0) {
    return (
      <div className="rounded-2xl border border-prime-border bg-white p-6 text-sm text-prime-muted">
        Nenhum serviço liberado para esta conta ainda. Fale com a central Prime Vitória.
      </div>
    );
  }

  if (created) {
    return (
      <div className="rounded-2xl border border-prime-border bg-white p-6 shadow-prime-card">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-xl text-emerald-700">
            ✓
          </span>
          <div>
            <h3 className="font-prime-display text-xl text-prime-text">Pedido recebido!</h3>
            <p className="text-sm text-prime-muted">
              A central Prime vai confirmar e avisar assim que o motorista for definido.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-2 rounded-xl bg-prime-bg p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-prime-muted">Quando</dt><dd className="font-semibold">{created.when}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-prime-muted">Serviço</dt><dd>{created.service}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-prime-muted">Passageiro</dt><dd>{created.passenger}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-prime-muted">Embarque</dt><dd className="text-right">{created.origin}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-prime-muted">Destino</dt><dd className="text-right">{created.destination}</dd></div>
        </dl>
        <button type="button" onClick={reset} className="mt-5 w-full rounded-lg bg-[#111] px-4 py-3 font-semibold text-white hover:bg-black">
          Pedir outra corrida
        </button>
      </div>
    );
  }

  const estimateBox = (() => {
    if (!serviceType) return null;
    if (estimateBusy) return <p className="text-sm text-prime-muted">Calculando…</p>;
    if (!hasCoords) {
      return <p className="text-sm text-prime-muted">Escolha embarque e destino nas sugestões do mapa para ver o valor estimado.</p>;
    }
    if (!estimate?.hasRule || estimate.clientAmount == null) {
      return <p className="text-sm text-prime-muted">A central confirma o valor deste serviço.</p>;
    }
    return (
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-prime-muted">Valor estimado</p>
          <p className="font-prime-display text-3xl text-prime-text">{brl(estimate.clientAmount)}</p>
        </div>
        <p className="text-right text-xs text-prime-muted">
          {estimate.plannedKm != null ? `${estimate.plannedKm.toLocaleString("pt-BR")} km aprox.` : null}
          {estimate.chargeType === "per_km" && estimate.pricePerKm != null ? ` · ${brl(estimate.pricePerKm)}/km` : null}
          <br />
          Valor final conforme KM rodado e espera.
        </p>
      </div>
    );
  })();

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-6 rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card sm:p-6">
      {/* 1. Serviço */}
      <section className="grid gap-3">
        <StepTitle n={1}>Tipo de serviço</StepTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => {
            const active = s.id === serviceType;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceType(s.id);
                  setPassengerCount((c) => Math.min(c, maxPassengersForService(s.id)));
                }}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                  active ? "border-prime-gold bg-prime-gold/10 ring-1 ring-prime-gold" : "border-prime-border hover:border-prime-gold"
                }`}
                aria-pressed={active}
              >
                <span className={active ? "text-prime-gold" : "text-prime-muted"}>
                  <ServiceIcon icon={s.icon} />
                </span>
                <span>
                  <span className="block font-semibold text-prime-text">{s.label}</span>
                  <span className="mt-0.5 block text-xs text-prime-muted">{s.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Quando */}
      <section className="grid gap-3">
        <StepTitle n={2}>Data e horário</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            Data
            <input type="date" required min={saoPauloTodayYmd()} value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
          </label>
          <label className={LABEL}>
            Horário do embarque
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={FIELD} />
          </label>
        </div>
        {scheduledIso ? (
          <p className="text-xs text-prime-muted">Embarque em {formatBrDateTime(scheduledIso)} (horário de Brasília).</p>
        ) : null}
      </section>

      {/* 3. Trajeto */}
      <section className="grid gap-3">
        <StepTitle n={3}>Trajeto</StepTitle>
        {presets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-prime-muted">Rotas recentes:</span>
            {presets.slice(0, 6).map((p) => (
              <span key={p.id} className="inline-flex items-center rounded-full border border-prime-border bg-prime-bg text-xs">
                <button type="button" onClick={() => applyPreset(p)} className="px-3 py-1 text-prime-text hover:text-prime-gold">
                  {p.label}
                </button>
                <button
                  type="button"
                  onClick={() => setPresets(removeTripPreset(clientId, p.id))}
                  className="pr-2.5 text-prime-muted hover:text-red-700"
                  aria-label={`Remover ${p.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <AddressAutocompleteInput
          label="Embarque"
          required
          placeholder="Ex.: Aeroporto de Vitória"
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
          devFallbackRole={devFallbackRole}
        />
        <AddressAutocompleteInput
          label="Destino"
          required
          placeholder="Ex.: Hotel Golden Tulip, Enseada do Suá"
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
          devFallbackRole={devFallbackRole}
        />
      </section>

      {/* 4. Passageiro */}
      <section className="grid gap-3">
        <StepTitle n={4}>Passageiro</StepTitle>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
          <PassengerAutocompleteInput
            clientId={clientId}
            label="Nome do passageiro"
            value={passengerName}
            onChange={setPassengerName}
            onSelect={(p) => {
              setPassengerName(p.name);
              if (p.phone) setPassengerPhone(p.phone);
            }}
            devFallbackRole={devFallbackRole}
          />
          <label className={LABEL}>
            Celular
            <input type="tel" inputMode="tel" value={passengerPhone} onChange={(e) => setPassengerPhone(e.target.value)} placeholder="(27) 99999-9999" className={FIELD} />
          </label>
          <label className={LABEL}>
            Passageiros
            <input
              type="number"
              min={1}
              max={maxPassengers}
              required
              value={passengerCount}
              onChange={(e) => setPassengerCount(Math.min(maxPassengers, Math.max(1, Number(e.target.value) || 1)))}
              className={FIELD}
            />
          </label>
        </div>
        {costCenters.length > 0 ? (
          <label className={LABEL}>
            Centro de custo
            <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className={FIELD}>
              <option value="">Não informar</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.code ? `${cc.code} · ` : ""}
                  {cc.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={LABEL}>
          Observações
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nº do voo, bagagem, ponto de encontro…"
            className={FIELD}
          />
        </label>
      </section>

      {estimateBox ? <div className="rounded-xl border border-prime-gold/40 bg-prime-gold/5 p-4">{estimateBox}</div> : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2">
        <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#111] px-4 py-3.5 text-base font-semibold text-white hover:bg-black disabled:opacity-60">
          {loading ? "Enviando…" : "Solicitar corrida"}
        </button>
        {clientName ? (
          <p className="text-center text-xs text-prime-muted">
            Cobrança faturada para {clientName}. O passageiro não paga nada ao motorista.
          </p>
        ) : null}
      </div>
    </form>
  );
}
