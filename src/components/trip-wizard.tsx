"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PassengerAutocompleteInput } from "@/components/passenger-autocomplete-input";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { formatBrDateTime, formatBrTime, saoPauloDateAndTimeToUtcIso, saoPauloTodayYmd } from "@/lib/dates/br-date";
import { normalizeFlightNumber } from "@/lib/trips/flight";
import { PRESENTATION_OPTIONS, SERVICE_EXTRAS, presentationAtIso, serviceExtrasLabel } from "@/lib/trips/service-extras";
import { SERVICE_MODE_LABEL, legacyServiceType, type CategoryKind, type ServiceMode } from "@/lib/pricing/category-catalog";

type Client = { id: string; name: string; trade_name?: string | null; type: string; document?: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null };
type Category = { id: string; name: string; description: string | null; passengers: number; kind: CategoryKind; photo_url: string | null };
type PriceRow = { category_id: string; service: string; enabled: boolean; client_price: number | null; partner_price: number | null };

const STEPS = ["Cliente", "Data e hora", "Veículo", "Detalhes", "Resumo"] as const;
const ALL_MODES: ServiceMode[] = ["transfer", "diaria_5h", "diaria_10h", "diaria_12h", "km"];
const input = PRIME_INPUT_CLASS;

const brl = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function addDaysYmd(ymd: string, n: number) {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/** Nova corrida em 5 etapas, com cadastro rápido de cliente e escolha do veículo por cartões. */
export function TripWizard({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Cliente
  const [clients, setClients] = useState<Client[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [clientType, setClientType] = useState<"todos" | "PJ" | "PF">("todos");
  const [clientId, setClientId] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [nc, setNc] = useState({ type: "PJ" as "PJ" | "PF", name: "", document: "", whatsapp: "", email: "" });

  // 2. Data
  const today = saoPauloTodayYmd();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [returnDate, setReturnDate] = useState(today);
  const [returnTime, setReturnTime] = useState("");

  // 3. Veículo
  const [categories, setCategories] = useState<Category[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<ServiceMode>("transfer");

  // 4. Detalhes
  const [passengers, setPassengers] = useState(1);
  const [paxName, setPaxName] = useState("");
  const [paxPhone, setPaxPhone] = useState("");
  const [origin, setOrigin] = useState({ text: "", lat: null as number | null, lng: null as number | null });
  const [dest, setDest] = useState({ text: "", lat: null as number | null, lng: null as number | null });
  const [flight, setFlight] = useState("");
  const [osRef, setOsRef] = useState("");
  const [clientAmount, setClientAmount] = useState("");
  const [driverAmount, setDriverAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [presentation, setPresentation] = useState(15);
  const [extras, setExtras] = useState<string[]>([]);

  const loadClients = useCallback(async () => {
    const res = await fetchWithSupabaseSession("/api/clients", {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Client[] };
    if (res.ok && json.success) setClients(json.data ?? []);
  }, []);

  useEffect(() => {
    void loadClients();
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/vehicle-categories", {}, "admin");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: (Category & { active?: boolean })[] };
      if (res.ok && json.success) setCategories((json.data ?? []).filter((c) => c.active !== false));
    })();
  }, [loadClients]);

  useEffect(() => {
    setPrices([]);
    if (!clientId) return;
    void (async () => {
      const res = await fetchWithSupabaseSession(`/api/clients/${clientId}/category-prices`, {}, "admin");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: PriceRow[] };
      if (res.ok && json.success) setPrices(json.data ?? []);
    })();
  }, [clientId]);

  const client = clients.find((c) => c.id === clientId) ?? null;
  const category = categories.find((c) => c.id === categoryId) ?? null;

  const enabledFor = useCallback(
    (catId: string) => {
      const cells = prices.filter((p) => p.category_id === catId && p.enabled);
      const modes = new Set<ServiceMode>();
      for (const c of cells) {
        if (c.service === "km_b1" || c.service === "km_b2") modes.add("km");
        else if ((ALL_MODES as string[]).includes(c.service)) modes.add(c.service as ServiceMode);
      }
      return [...modes];
    },
    [prices]
  );

  const sortedCategories = useMemo(() => {
    const withFlag = categories.map((c) => ({ ...c, released: enabledFor(c.id).length > 0 }));
    return withFlag.sort((a, b) => Number(b.released) - Number(a.released));
  }, [categories, enabledFor]);

  // Preço da tabela da empresa para o veículo + serviço escolhidos (transfer/diária).
  const tablePrice = useMemo(() => {
    if (!categoryId || mode === "km") return null;
    return prices.find((p) => p.category_id === categoryId && p.service === mode && p.enabled) ?? null;
  }, [prices, categoryId, mode]);

  useEffect(() => {
    if (tablePrice?.client_price != null && !clientAmount) setClientAmount(String(tablePrice.client_price));
    if (tablePrice?.partner_price != null && !driverAmount) setDriverAmount(String(tablePrice.partner_price));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablePrice]);

  const [kmEstimate, setKmEstimate] = useState<{ km: number | null; client: number; driver: number | null; bandeira?: string } | null>(null);
  useEffect(() => {
    setKmEstimate(null);
    if (mode !== "km" || !clientId || !categoryId || origin.lat == null || dest.lat == null) return;
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetchWithSupabaseSession(
          "/api/pricing/estimate-trip",
          {
            method: "POST",
            body: JSON.stringify({
              client_id: clientId,
              service_type: "corporativo",
              vehicle_category_id: categoryId,
              service_mode: "km",
              scheduled_at: date && time ? saoPauloDateAndTimeToUtcIso(date, time) ?? undefined : undefined,
              origin_lat: origin.lat,
              origin_lng: origin.lng,
              destination_lat: dest.lat,
              destination_lng: dest.lng
            })
          },
          "admin"
        );
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { estimate?: { planned_km: number | null; client_amount: number; driver_amount?: number | null } | null; bandeira?: string };
        };
        const e = json.data?.estimate;
        if (res.ok && json.success && e) setKmEstimate({ km: e.planned_km, client: e.client_amount, driver: e.driver_amount ?? null, bandeira: json.data?.bandeira });
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [mode, clientId, categoryId, origin.lat, origin.lng, dest.lat, dest.lng, date, time]);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    return clients
      .filter((c) => clientType === "todos" || c.type === clientType)
      .filter((c) =>
        !q ? true : [c.name, c.trade_name, c.document, c.phone, c.whatsapp].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [clients, clientQuery, clientType]);

  const scheduledIso = date && time ? saoPauloDateAndTimeToUtcIso(date, time) : null;
  const returnIso = roundTrip && returnDate && returnTime ? saoPauloDateAndTimeToUtcIso(returnDate, returnTime) : null;

  function missing(s: number): string[] {
    const m: string[] = [];
    if (s === 0 && !clientId) m.push("escolher o cliente");
    if (s === 1) {
      if (!scheduledIso) m.push("data e horário");
      if (roundTrip && !returnIso) m.push("data e horário da volta");
      if (roundTrip && scheduledIso && returnIso && returnIso <= scheduledIso) m.push("volta depois da ida");
    }
    if (s === 2) {
      if (!categoryId) m.push("escolher o veículo");
      if (category && passengers > category.passengers) m.push(`no máximo ${category.passengers} passageiros nesse veículo`);
    }
    if (s === 3) {
      if (origin.text.trim().length < 3) m.push("local de embarque");
      if (dest.text.trim().length < 3) m.push("destino");
      if (category && passengers > category.passengers) m.push(`no máximo ${category.passengers} passageiros`);
    }
    return m;
  }

  const currentMissing = missing(step);
  const canNext = currentMissing.length === 0;

  async function createClient() {
    if (nc.name.trim().length < 2) {
      setError("Informe o nome do cliente.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetchWithSupabaseSession(
      "/api/clients",
      {
        method: "POST",
        body: JSON.stringify({
          type: nc.type,
          name: nc.name.trim(),
          document: nc.document.trim() || null,
          whatsapp: nc.whatsapp.trim() || null,
          phone: nc.whatsapp.trim() || null,
          email: nc.email.trim() || null,
          registry_status: "incompleto"
        })
      },
      "admin"
    );
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { id: string }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success || !json.data?.id) {
      setError(json.error?.message ?? "Não foi possível cadastrar o cliente.");
      return;
    }
    await loadClients();
    setClientId(json.data.id);
    setShowNewClient(false);
    setNc({ type: "PJ", name: "", document: "", whatsapp: "", email: "" });
    setStep(1);
  }

  async function submit() {
    if (!client || !category || !scheduledIso) return;
    setBusy(true);
    setError(null);
    const notesFull = [osRef.trim() ? `O.S./Ref.: ${osRef.trim()}` : "", notes.trim()].filter(Boolean).join("\n");
    const body = {
      client_id: client.id,
      service_type: legacyServiceType(category.kind, mode),
      vehicle_category_id: category.id,
      service_mode: mode,
      scheduled_at: scheduledIso,
      origin_text: origin.text.trim(),
      origin_lat: origin.lat ?? undefined,
      origin_lng: origin.lng ?? undefined,
      destination_text: dest.text.trim(),
      destination_lat: dest.lat ?? undefined,
      destination_lng: dest.lng ?? undefined,
      passenger_name: paxName.trim() || undefined,
      passenger_phone: paxPhone.trim() || undefined,
      passenger_count: passengers,
      flight_number: normalizeFlightNumber(flight) ?? undefined,
      notes: notesFull || undefined,
      client_amount: Number(clientAmount.replace(",", ".")) || undefined,
      driver_amount: Number(driverAmount.replace(",", ".")) || undefined,
      dispatch_mode: "directed" as const,
      presentation_minutes: presentation,
      service_extras: extras,
      ...(roundTrip && returnIso ? { round_trip: true, return_scheduled_at: returnIso } : {})
    };
    const res = await fetchWithSupabaseSession("/api/trips", { method: "POST", body: JSON.stringify(body) }, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { id: string }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success || !json.data?.id) {
      setError(json.error?.message ?? "Não foi possível criar a corrida.");
      return;
    }
    onDone?.();
    router.push(`/agenda?trip=${json.data.id}#trip-detail` as Route);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-prime-border bg-white shadow-prime-card">
      {/* Etapas */}
      <ol className="grid grid-cols-5 border-b border-prime-border">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={i > step && missing(step).length > 0}
                onClick={() => (i <= step || STEPS.slice(0, i).every((_, k) => missing(k).length === 0)) && setStep(i)}
                className={`flex w-full flex-col items-center gap-1 px-1 py-3 text-xs sm:flex-row sm:justify-center sm:gap-2 sm:text-sm ${
                  active ? "font-semibold text-prime-text" : done ? "text-prime-text" : "text-prime-muted"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    active ? "bg-[#111] text-prime-gold" : done ? "bg-prime-gold text-[#111]" : "bg-prime-bg text-prime-muted ring-1 ring-prime-border"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="text-center">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="p-4 sm:p-6">
        {/* 1. CLIENTE */}
        {step === 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${input} max-w-md flex-1`}
                placeholder="Buscar cliente por nome, CNPJ/CPF ou telefone"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                autoFocus
              />
              <div className="inline-flex rounded-lg border border-prime-border p-0.5 text-sm">
                {(["todos", "PJ", "PF"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setClientType(t)}
                    className={`rounded-md px-3 py-1 ${clientType === t ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}
                  >
                    {t === "todos" ? "Todos" : t === "PJ" ? "Empresas" : "Pessoas"}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-primary" onClick={() => setShowNewClient((v) => !v)}>
                {showNewClient ? "Cancelar" : "+ Novo cliente"}
              </button>
            </div>

            {showNewClient ? (
              <div className="grid gap-3 rounded-xl border border-prime-gold bg-prime-bg p-4 sm:grid-cols-2">
                <p className="text-sm font-semibold sm:col-span-2">Cadastro rápido. Depois você completa em Clientes.</p>
                <div className="inline-flex rounded-lg border border-prime-border bg-white p-0.5 text-sm sm:col-span-2 sm:w-fit">
                  {(["PJ", "PF"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNc({ ...nc, type: t })}
                      className={`rounded-md px-3 py-1 ${nc.type === t ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}
                    >
                      {t === "PJ" ? "Empresa" : "Pessoa física"}
                    </button>
                  ))}
                </div>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span>{nc.type === "PJ" ? "Nome da empresa" : "Nome completo"} *</span>
                  <input className={input} value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>{nc.type === "PJ" ? "CNPJ" : "CPF"}</span>
                  <input className={input} value={nc.document} onChange={(e) => setNc({ ...nc, document: e.target.value })} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>WhatsApp</span>
                  <input className={input} placeholder="(27) 99999-9999" value={nc.whatsapp} onChange={(e) => setNc({ ...nc, whatsapp: e.target.value })} />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span>E-mail</span>
                  <input className={input} type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
                </label>
                <div className="sm:col-span-2">
                  <button type="button" disabled={busy} className="btn-primary disabled:opacity-50" onClick={() => void createClient()}>
                    {busy ? "Salvando…" : "Cadastrar e continuar"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredClients.map((c) => {
                const sel = c.id === clientId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClientId(c.id);
                      setCategoryId("");
                      setClientAmount("");
                      setDriverAmount("");
                      setStep(1);
                    }}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                      sel ? "border-prime-gold bg-prime-bg ring-1 ring-prime-gold" : "border-prime-border hover:border-prime-gold"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#111] text-xs font-bold text-prime-gold">
                      {(c.trade_name || c.name).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.trade_name || c.name}</span>
                      <span className="block truncate text-xs text-prime-muted">
                        {c.type === "PJ" ? "Empresa" : "Pessoa"}
                        {c.document ? ` · ${c.document}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
              {filteredClients.length === 0 ? (
                <p className="text-sm text-prime-muted">Nenhum cliente encontrado. Use “+ Novo cliente”.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* 2. DATA E HORA */}
        {step === 1 ? (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-semibold">Ida</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ["Hoje", today],
                  ["Amanhã", addDaysYmd(today, 1)],
                  ["Depois de amanhã", addDaysYmd(today, 2)]
                ].map(([label, ymd]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setDate(ymd)}
                    className={`rounded-full px-3 py-1.5 text-sm ring-1 ${date === ymd ? "bg-[#111] text-[#fff] ring-[#111]" : "ring-prime-border"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm">
                  <span>Data</span>
                  <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Horário</span>
                  <input type="time" step={300} className={input} value={time} onChange={(e) => setTime(e.target.value)} autoFocus />
                </label>
              </div>
              {scheduledIso ? <p className="text-sm text-prime-muted">Embarque: {formatBrDateTime(scheduledIso)}</p> : null}
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
                Tem volta (ida e volta)
              </label>
              {roundTrip ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm">
                    <span>Data da volta</span>
                    <input type="date" className={input} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Horário da volta</span>
                    <input type="time" step={300} className={input} value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
                  </label>
                  <p className="col-span-2 text-xs text-prime-muted">A volta vira uma segunda corrida, com o trajeto invertido.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* 3. VEÍCULO */}
        {step === 2 ? (
          <div className="space-y-4">
            {categories.length === 0 ? (
              <p className="text-sm text-prime-muted">Nenhuma categoria de veículo cadastrada. Cadastre em Categorias.</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedCategories.map((c) => {
                const sel = c.id === categoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(c.id);
                      setClientAmount("");
                      setDriverAmount("");
                      const modes = enabledFor(c.id);
                      setMode(modes[0] ?? "transfer");
                    }}
                    className={`overflow-hidden rounded-2xl border text-left transition ${
                      sel ? "border-prime-gold ring-2 ring-prime-gold" : "border-prime-border hover:border-prime-gold"
                    }`}
                  >
                    <div className="flex h-28 items-center justify-center bg-prime-bg">
                      {c.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.photo_url} alt={c.name} className="h-full w-full object-contain p-2" />
                      ) : (
                        <span className="text-4xl">{c.kind === "onibus" ? "🚌" : c.kind === "van" ? "🚐" : "🚘"}</span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{c.name}</p>
                        <span className="shrink-0 text-xs text-prime-muted">até {c.passengers} pax</span>
                      </div>
                      {c.released ? (
                        <p className="mt-1 text-xs font-medium text-emerald-700">Liberado para este cliente</p>
                      ) : (
                        <p className="mt-1 text-xs text-prime-muted">Sem preço na tabela do cliente</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {category ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Tipo de serviço</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_MODES.map((m) => {
                    const released = enabledFor(category.id).includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMode(m);
                          setClientAmount("");
                          setDriverAmount("");
                        }}
                        className={`rounded-full px-3 py-1.5 text-sm ring-1 ${
                          mode === m ? "bg-[#111] text-[#fff] ring-[#111]" : released ? "ring-prime-gold" : "text-prime-muted ring-prime-border"
                        }`}
                      >
                        {SERVICE_MODE_LABEL[m]}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-3 pt-2 text-sm">
                  <span className="font-semibold">Passageiros</span>
                  <button type="button" className="h-8 w-8 rounded-full ring-1 ring-prime-border" onClick={() => setPassengers((n) => Math.max(1, n - 1))}>
                    −
                  </button>
                  <span className="w-6 text-center text-lg font-semibold">{passengers}</span>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-full ring-1 ring-prime-border"
                    onClick={() => setPassengers((n) => Math.min(category.passengers, n + 1))}
                  >
                    +
                  </button>
                  <span className="text-xs text-prime-muted">máx. {category.passengers}</span>
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 4. DETALHES */}
        {step === 3 && client ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 md:col-span-2">
              <AddressAutocompleteInput
                label="Local de embarque"
                required
                placeholder="Ex.: Aeroporto de Vitória"
                value={origin.text}
                hasCoords={origin.lat != null}
                onChange={(t) => setOrigin({ text: t, lat: null, lng: null })}
                onPlaceSelect={(p) => setOrigin({ text: p.displayName, lat: p.lat, lng: p.lng })}
                onCoordsClear={() => setOrigin((o) => ({ ...o, lat: null, lng: null }))}
                devFallbackRole="admin"
              />
              <div className="flex justify-center">
                <button
                  type="button"
                  className="rounded-full px-3 py-1 text-xs ring-1 ring-prime-border hover:ring-prime-gold"
                  onClick={() => {
                    setOrigin(dest);
                    setDest(origin);
                  }}
                >
                  ⇅ Inverter
                </button>
              </div>
              <AddressAutocompleteInput
                label="Destino"
                required
                placeholder="Ex.: Hotel, empresa ou endereço"
                value={dest.text}
                hasCoords={dest.lat != null}
                onChange={(t) => setDest({ text: t, lat: null, lng: null })}
                onPlaceSelect={(p) => setDest({ text: p.displayName, lat: p.lat, lng: p.lng })}
                onCoordsClear={() => setDest((o) => ({ ...o, lat: null, lng: null }))}
                devFallbackRole="admin"
              />
            </div>
            <PassengerAutocompleteInput
              clientId={client.id}
              label="Passageiro principal"
              value={paxName}
              onChange={setPaxName}
              onSelect={(p) => {
                setPaxName(p.name);
                if (p.phone) setPaxPhone(p.phone);
              }}
              devFallbackRole="admin"
            />
            <label className="grid gap-1 text-sm">
              <span>WhatsApp do passageiro</span>
              <input className={input} placeholder="(27) 99999-9999" value={paxPhone} onChange={(e) => setPaxPhone(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Nº do voo (se for aeroporto)</span>
              <input className={input} placeholder="Ex.: LA3456" value={flight} onChange={(e) => setFlight(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>O.S. ou referência do cliente</span>
              <input className={input} value={osRef} onChange={(e) => setOsRef(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Valor para o cliente (R$)</span>
              <input className={input} inputMode="decimal" placeholder="Em branco = tabela ou a combinar" value={clientAmount} onChange={(e) => setClientAmount(e.target.value)} />
              {tablePrice?.client_price != null ? (
                <span className="text-xs text-emerald-700">Tabela do cliente: {brl(tablePrice.client_price)}</span>
              ) : mode === "km" ? (
                kmEstimate ? (
                  <span className="rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
                    <b>Estimativa: {brl(kmEstimate.client)}</b> · cerca de {kmEstimate.km?.toLocaleString("pt-BR")} km · {kmEstimate.bandeira}
                    {kmEstimate.driver != null ? ` · motorista ${brl(kmEstimate.driver)}` : ""}. O valor final sai do km rodado. Deixe em branco para cobrar por km.
                  </span>
                ) : origin.lat == null || dest.lat == null ? (
                  <span className="text-xs text-prime-muted">Escolha embarque e destino na lista de sugestões para calcular a estimativa.</span>
                ) : (
                  <span className="text-xs text-amber-700">Sem preço por km na tabela deste cliente para esta categoria.</span>
                )
              ) : null}
            </label>
            <label className="grid gap-1 text-sm">
              <span>Valor para o motorista (R$)</span>
              <input className={input} inputMode="decimal" placeholder="Em branco = tabela" value={driverAmount} onChange={(e) => setDriverAmount(e.target.value)} />
              {tablePrice?.partner_price != null ? (
                <span className="text-xs text-emerald-700">Tabela do parceiro: {brl(tablePrice.partner_price)}</span>
              ) : null}
            </label>
            <div className="grid gap-2 text-sm md:col-span-2">
              <span>Motorista chega antes do horário</span>
              <div className="flex flex-wrap gap-2">
                {PRESENTATION_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPresentation(m)}
                    className={`rounded-full px-3 py-1.5 ring-1 ${presentation === m ? "bg-[#111] text-[#fff] ring-[#111]" : "ring-prime-border"}`}
                  >
                    {m === 0 ? "No horário" : `${m} min antes`}
                  </button>
                ))}
              </div>
              {scheduledIso && presentation > 0 ? (
                <span className="text-xs text-prime-muted">
                  Motorista no local às {formatBrTime(presentationAtIso(scheduledIso, presentation) ?? scheduledIso)}
                </span>
              ) : null}
            </div>
            <div className="grid gap-2 text-sm md:col-span-2">
              <span>Marcações da reserva</span>
              <div className="flex flex-wrap gap-2">
                {SERVICE_EXTRAS.map((e) => {
                  const on = extras.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setExtras((list) => (on ? list.filter((x) => x !== e.id) : [...list, e.id]))}
                      className={`rounded-full px-3 py-1.5 ring-1 ${on ? "bg-prime-gold font-semibold text-[#111] ring-prime-gold" : "ring-prime-border"}`}
                    >
                      {on ? "✓ " : ""}
                      {e.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span>Observações para o motorista</span>
              <textarea className={input} rows={3} placeholder="Ex.: placa com nome, água a bordo, cadeirinha…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
        ) : null}

        {/* 5. RESUMO */}
        {step === 4 && client && category ? (
          <div className="grid gap-4 md:grid-cols-2">
            <dl className="grid gap-3 rounded-2xl border border-prime-border p-4 text-sm">
              <div>
                <dt className="text-xs text-prime-muted">Cliente</dt>
                <dd className="font-semibold">{client.trade_name || client.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-prime-muted">Quando</dt>
                <dd className="font-semibold">{scheduledIso ? formatBrDateTime(scheduledIso) : "—"}</dd>
                {roundTrip && returnIso ? <dd>Volta: {formatBrDateTime(returnIso)}</dd> : null}
              </div>
              <div>
                <dt className="text-xs text-prime-muted">Veículo e serviço</dt>
                <dd className="font-semibold">
                  {category.name} · {SERVICE_MODE_LABEL[mode]} · {passengers} pax
                </dd>
              </div>
            </dl>
            <dl className="grid gap-3 rounded-2xl border border-prime-border p-4 text-sm">
              <div>
                <dt className="text-xs text-prime-muted">Trajeto</dt>
                <dd>{origin.text}</dd>
                <dd>→ {dest.text}</dd>
              </div>
              <div>
                <dt className="text-xs text-prime-muted">Passageiro</dt>
                <dd>
                  {paxName || "a definir"}
                  {paxPhone ? ` · ${paxPhone}` : ""}
                  {flight ? ` · voo ${normalizeFlightNumber(flight) ?? flight}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-prime-muted">Motorista no local</dt>
                <dd>
                  {presentation > 0 && scheduledIso ? `${presentation} min antes` : "No horário"}
                  {extras.length ? ` · ${serviceExtrasLabel(extras)}` : ""}
                </dd>
              </div>
              <div className="flex gap-6">
                <div>
                  <dt className="text-xs text-prime-muted">Cliente paga</dt>
                  <dd className="font-semibold">
                    {Number(clientAmount.replace(",", "."))
                      ? brl(Number(clientAmount.replace(",", ".")))
                      : mode === "km" && kmEstimate
                        ? `≈ ${brl(kmEstimate.client)} (por km)`
                        : "Tabela / a combinar"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-prime-muted">Motorista recebe</dt>
                  <dd className="font-semibold">
                    {Number(driverAmount.replace(",", "."))
                      ? brl(Number(driverAmount.replace(",", ".")))
                      : mode === "km" && kmEstimate?.driver != null
                        ? `≈ ${brl(kmEstimate.driver)} (por km)`
                        : "Tabela"}
                  </dd>
                </div>
              </div>
            </dl>
            <p className="text-sm text-prime-muted md:col-span-2">
              Depois de criar, a corrida abre na tela dela para você escolher o motorista.
            </p>
          </div>
        ) : null}

        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

        {/* Navegação */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-prime-border pt-4">
          {step > 0 ? (
            <button type="button" className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border" onClick={() => setStep((s) => s - 1)}>
              ← Voltar
            </button>
          ) : null}
          {currentMissing.length > 0 && step < 4 ? (
            <span className="text-sm text-amber-800">Falta: {currentMissing.join(", ")}</span>
          ) : null}
          {step < 4 ? (
            <button
              type="button"
              disabled={!canNext}
              className="btn-primary ml-auto disabled:opacity-40"
              onClick={() => setStep((s) => s + 1)}
            >
              Continuar →
            </button>
          ) : (
            <button type="button" disabled={busy} className="btn-primary ml-auto disabled:opacity-50" onClick={() => void submit()}>
              {busy ? "Criando…" : roundTrip ? "Criar ida e volta" : "Criar corrida"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
