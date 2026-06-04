"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { DateTimeInput } from "@/components/datetime-input";
import { parseBrDateTimeToIso } from "@/lib/dates/br-date";
import { primeMarginFromAmounts } from "@/lib/pricing/prime-price-estimate";
import { PRIME_SERVICE_TYPES } from "@/lib/pricing/prime-service-types";
import { buildAgendaTripHref } from "@/lib/operations/agenda-trip-href";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type ClientRow = { id: string; name: string };

type LegForm = {
  origin_text: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_text: string;
  destination_lat: number | null;
  destination_lng: number | null;
  client_amount: string;
  driver_amount: string;
};

type Props = {
  scheduledFrom: string;
  scheduledTo: string;
};

function defaultScheduledIso(): string {
  const d = new Date(Date.now() + 24 * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function emptyLeg(): LegForm {
  return {
    origin_text: "",
    origin_lat: null,
    origin_lng: null,
    destination_text: "",
    destination_lat: null,
    destination_lng: null,
    client_amount: "",
    driver_amount: ""
  };
}

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function OperadorTripCreatePanel({ scheduledFrom, scheduledTo }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [hasPricingRule, setHasPricingRule] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [multiLeg, setMultiLeg] = useState(false);
  const [legs, setLegs] = useState<LegForm[]>([emptyLeg()]);
  const [form, setForm] = useState({
    client_id: "",
    service_type: "transfer_seda",
    scheduled_at: defaultScheduledIso(),
    origin_text: "",
    origin_lat: null as number | null,
    origin_lng: null as number | null,
    destination_text: "",
    destination_lat: null as number | null,
    destination_lng: null as number | null,
    passenger_name: "",
    dispatch_mode: "directed" as "directed" | "offer",
    planned_km: null as number | null,
    client_amount: "",
    driver_amount: ""
  });

  const totals = useMemo(() => {
    if (multiLeg) {
      const client = legs.reduce((s, l) => s + (Number(l.client_amount) || 0), 0);
      const driver = legs.reduce((s, l) => s + (Number(l.driver_amount) || 0), 0);
      return { client, driver, margin: primeMarginFromAmounts(client, driver) };
    }
    const client = Number(form.client_amount) || 0;
    const driver = Number(form.driver_amount) || 0;
    return { client, driver, margin: primeMarginFromAmounts(client, driver) };
  }, [multiLeg, legs, form.client_amount, form.driver_amount]);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/clients", {}, "admin");
      const json = (await res.json()) as { success?: boolean; data?: ClientRow[] };
      if (res.ok && json.success) {
        const list = json.data ?? [];
        setClients(list);
        if (list[0] && !form.client_id) {
          setForm((f) => ({ ...f, client_id: list[0].id }));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init client_id once
  }, []);

  async function refreshEstimate() {
    if (!form.client_id || multiLeg) return;
    setEstimateBusy(true);
    try {
      const res = await fetchWithSupabaseSession(
        "/api/pricing/estimate-trip",
        {
          method: "POST",
          body: JSON.stringify({
            client_id: form.client_id,
            service_type: form.service_type,
            origin_lat: form.origin_lat,
            origin_lng: form.origin_lng,
            destination_lat: form.destination_lat,
            destination_lng: form.destination_lng
          })
        },
        "admin"
      );
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          has_rule?: boolean;
          estimate: {
            planned_km: number | null;
            client_amount: number;
            driver_amount: number;
            margin: number;
          } | null;
        };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setMessage(json.error?.message ?? "Não foi possível estimar o valor.");
        setHasPricingRule(null);
        return;
      }
      const hasRule = json.data?.has_rule !== false && json.data?.estimate != null;
      setHasPricingRule(hasRule);
      if (hasRule && json.data?.estimate) {
        const e = json.data.estimate;
        setForm((f) => ({
          ...f,
          planned_km: e.planned_km,
          client_amount: String(e.client_amount),
          driver_amount: String(e.driver_amount)
        }));
      } else {
        setForm((f) => ({ ...f, planned_km: null, client_amount: "", driver_amount: "" }));
      }
      setMessage(null);
    } catch {
      setMessage("Erro ao calcular estimativa.");
    } finally {
      setEstimateBusy(false);
    }
  }

  useEffect(() => {
    if (!form.client_id || multiLeg) return;
    const t = setTimeout(() => void refreshEstimate(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce estimate
  }, [
    form.client_id,
    form.service_type,
    form.origin_lat,
    form.origin_lng,
    form.destination_lat,
    form.destination_lng,
    multiLeg
  ]);

  function onAmountChange(field: "client_amount" | "driver_amount", value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function patchLeg(index: number, patch: Partial<LegForm>) {
    setLegs((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLeg() {
    setLegs((prev) => [...prev, emptyLeg()]);
  }

  function removeLeg(index: number) {
    setLegs((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (totals.client <= 0 || totals.driver < 0) {
      setMessage("Preencha valor cliente e valor motorista (obrigatórios).");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const scheduled_at =
        parseBrDateTimeToIso(form.scheduled_at) ?? new Date(form.scheduled_at).toISOString();
      const client_amount = totals.client;
      const driver_amount = totals.driver;
      const margin = totals.margin;

      const body = multiLeg
        ? {
            client_id: form.client_id,
            service_type: form.service_type,
            scheduled_at,
            origin_text: legs[0].origin_text,
            destination_text: legs[legs.length - 1].destination_text,
            passenger_name: form.passenger_name || undefined,
            dispatch_mode: form.dispatch_mode,
            client_amount,
            driver_amount,
            margin,
            trip_legs: legs.map((l) => ({
              origin_text: l.origin_text,
              destination_text: l.destination_text,
              origin_lat: l.origin_lat,
              origin_lng: l.origin_lng,
              destination_lat: l.destination_lat,
              destination_lng: l.destination_lng,
              client_amount: Number(l.client_amount) || 0,
              driver_amount: Number(l.driver_amount) || 0
            }))
          }
        : {
            client_id: form.client_id,
            service_type: form.service_type,
            scheduled_at,
            origin_text: form.origin_text,
            origin_lat: form.origin_lat,
            origin_lng: form.origin_lng,
            destination_text: form.destination_text,
            destination_lat: form.destination_lat,
            destination_lng: form.destination_lng,
            passenger_name: form.passenger_name || undefined,
            dispatch_mode: form.dispatch_mode,
            client_amount,
            driver_amount,
            margin
          };

      const res = await fetchWithSupabaseSession(
        "/api/trips",
        { method: "POST", body: JSON.stringify(body) },
        "admin"
      );
      const json = (await res.json()) as { success?: boolean; data?: { id: string }; error?: { message?: string } };
      if (!res.ok || !json.success || !json.data?.id) {
        throw new Error(json.error?.message ?? "Não foi possível criar a corrida.");
      }
      setMessage("Corrida criada. A abrir na agenda…");
      void scheduledFrom;
      void scheduledTo;
      router.push(buildAgendaTripHref(json.data.id, scheduled_at) as Route);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao criar corrida.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card mb-6 border-prime-border">
      <h2 className="text-lg font-semibold text-prime-text">Nova corrida</h2>
      <p className="mt-1 text-sm text-prime-muted">
        Valores da tabela do cliente são sugeridos automaticamente e podem ser editados. Sem tabela, preencha
        manualmente.
      </p>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>Cliente corporativo</span>
          <select
            required
            className={PRIME_INPUT_CLASS}
            value={form.client_id}
            onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
          >
            <option value="">— seleccionar —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Tipo de serviço</span>
          <select
            required
            className={PRIME_INPUT_CLASS}
            value={form.service_type}
            onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
          >
            {PRIME_SERVICE_TYPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Data e hora</span>
          <DateTimeInput
            required
            className={PRIME_INPUT_CLASS}
            value={form.scheduled_at}
            onChange={(iso) => setForm((f) => ({ ...f, scheduled_at: iso ?? defaultScheduledIso() }))}
          />
        </label>

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={multiLeg}
            onChange={(e) => {
              setMultiLeg(e.target.checked);
              if (e.target.checked && legs.length === 1 && form.origin_text) {
                setLegs([
                  {
                    ...emptyLeg(),
                    origin_text: form.origin_text,
                    origin_lat: form.origin_lat,
                    origin_lng: form.origin_lng,
                    destination_text: form.destination_text,
                    destination_lat: form.destination_lat,
                    destination_lng: form.destination_lng,
                    client_amount: form.client_amount,
                    driver_amount: form.driver_amount
                  }
                ]);
              }
            }}
          />
          <span>Corrida com múltiplos trechos (ida + disponível + retorno, etc.)</span>
        </label>

        {!multiLeg ? (
          <>
            <AddressAutocompleteInput
              className="md:col-span-2"
              label="Origem"
              required
              placeholder="Ex.: Aeroporto de Vitória ES"
              value={form.origin_text}
              hasCoords={form.origin_lat != null && form.origin_lng != null}
              onChange={(origin_text) => setForm((f) => ({ ...f, origin_text }))}
              onPlaceSelect={(place) =>
                setForm((f) => ({
                  ...f,
                  origin_text: place.displayName,
                  origin_lat: place.lat,
                  origin_lng: place.lng
                }))
              }
              onCoordsClear={() => setForm((f) => ({ ...f, origin_lat: null, origin_lng: null }))}
            />
            <AddressAutocompleteInput
              className="md:col-span-2"
              label="Destino"
              required
              placeholder="Ex.: Shopping Vitória ES"
              value={form.destination_text}
              hasCoords={form.destination_lat != null && form.destination_lng != null}
              onChange={(destination_text) => setForm((f) => ({ ...f, destination_text }))}
              onPlaceSelect={(place) =>
                setForm((f) => ({
                  ...f,
                  destination_text: place.displayName,
                  destination_lat: place.lat,
                  destination_lng: place.lng
                }))
              }
              onCoordsClear={() =>
                setForm((f) => ({ ...f, destination_lat: null, destination_lng: null }))
              }
            />
          </>
        ) : (
          <div className="md:col-span-2 space-y-4">
            {legs.map((leg, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-prime-border bg-white p-4 shadow-prime-card"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-prime-text">Trecho {idx + 1}</h4>
                  {legs.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-red-700 hover:underline"
                      onClick={() => removeLeg(idx)}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className={PRIME_INPUT_CLASS}
                    required
                    placeholder="Origem do trecho"
                    value={leg.origin_text}
                    onChange={(e) => patchLeg(idx, { origin_text: e.target.value })}
                  />
                  <input
                    className={PRIME_INPUT_CLASS}
                    required
                    placeholder="Destino do trecho"
                    value={leg.destination_text}
                    onChange={(e) => patchLeg(idx, { destination_text: e.target.value })}
                  />
                  <label className="grid gap-1 text-sm">
                    <span>Valor cliente (R$)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      className={PRIME_INPUT_CLASS}
                      value={leg.client_amount}
                      onChange={(e) => patchLeg(idx, { client_amount: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Valor motorista (R$)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      className={PRIME_INPUT_CLASS}
                      value={leg.driver_amount}
                      onChange={(e) => patchLeg(idx, { driver_amount: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            ))}
            <button type="button" className="btn-outline text-sm" onClick={addLeg}>
              + Adicionar trecho
            </button>
          </div>
        )}

        <label className="grid gap-1 text-sm">
          <span>Passageiro</span>
          <input
            className={PRIME_INPUT_CLASS}
            value={form.passenger_name}
            onChange={(e) => setForm((f) => ({ ...f, passenger_name: e.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Modo despacho</span>
          <select
            className={PRIME_INPUT_CLASS}
            value={form.dispatch_mode}
            onChange={(e) =>
              setForm((f) => ({ ...f, dispatch_mode: e.target.value as "directed" | "offer" }))
            }
          >
            <option value="directed">Direcionado</option>
            <option value="offer">Por oferta</option>
          </select>
        </label>

        {!multiLeg ? (
          <div className="md:col-span-2 rounded-prime-card border border-prime-border bg-white p-4 shadow-prime-card">
            <h3 className="text-sm font-semibold text-prime-text">Valores da corrida</h3>
            {hasPricingRule === false ? (
              <p className="mt-1 text-xs text-amber-800">
                Cliente sem tabela para este serviço — preencha os valores manualmente.
              </p>
            ) : null}
            {estimateBusy ? (
              <p className="mt-2 text-xs text-prime-muted">A calcular…</p>
            ) : (
              <p className="mt-1 text-xs text-prime-muted">
                {form.planned_km != null
                  ? `Distância estimada: ${form.planned_km.toLocaleString("pt-BR")} km`
                  : "Informe origem e destino com coordenadas para estimar km."}
              </p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span>Valor cliente (R$) *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className={PRIME_INPUT_CLASS}
                  value={form.client_amount}
                  onChange={(e) => onAmountChange("client_amount", e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Valor motorista (R$) *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className={PRIME_INPUT_CLASS}
                  value={form.driver_amount}
                  onChange={(e) => onAmountChange("driver_amount", e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Margem</span>
                <p className="mt-2 text-lg font-semibold text-prime-gold">{fmtMoney(totals.margin)}</p>
              </label>
            </div>
            <button
              type="button"
              className="btn-outline mt-3 text-sm"
              disabled={estimateBusy || !form.client_id}
              onClick={() => void refreshEstimate()}
            >
              Recalcular da tabela
            </button>
          </div>
        ) : (
          <div className="md:col-span-2 rounded-prime-card border border-prime-border bg-white p-4 shadow-prime-card">
            <h3 className="text-sm font-semibold text-prime-text">Totais (todos os trechos)</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
              <span>
                Cliente: <strong>{fmtMoney(totals.client)}</strong>
              </span>
              <span>
                Motorista: <strong>{fmtMoney(totals.driver)}</strong>
              </span>
              <span>
                Margem: <strong className="text-prime-gold">{fmtMoney(totals.margin)}</strong>
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button type="submit" disabled={loading || clients.length === 0} className="btn-primary">
            {loading ? "A criar…" : "Criar e abrir na agenda"}
          </button>
          {clients.length === 0 ? (
            <span className="text-sm text-prime-amber">
              Cadastre um cliente em{" "}
              <a href="/clients" className="underline text-prime-gold">
                Clientes
              </a>{" "}
              primeiro.
            </span>
          ) : null}
        </div>
      </form>
      {message ? <p className="mt-2 text-sm text-prime-muted">{message}</p> : null}
    </section>
  );
}
