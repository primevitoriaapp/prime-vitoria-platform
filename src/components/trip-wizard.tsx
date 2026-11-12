"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAssignDrivers } from "@/components/quick-assign";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { PassengerAutocompleteInput } from "@/components/passenger-autocomplete-input";
import { TeamPassengerPicker } from "@/components/team-passenger-picker";
import { BookingPaymentFields, bookingPaymentBody, emptyBookingPayment } from "@/components/booking-payment-form";
import { DropoffStopsEditor, FinalStopPersonFields, emptyFinalPerson, stopsForApi, type EditableStop } from "@/components/dropoff-stops-editor";
import { teamMissingAddress, teamTripShape, type TeamDirection, type TeamMember } from "@/lib/trips/team-trip";
import { TypedDateTime } from "@/components/typed-date-time";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { formatBrDateTime, formatBrTime, saoPauloDateAndTimeToUtcIso, saoPauloTodayYmd } from "@/lib/dates/br-date";
import { normalizeFlightNumber } from "@/lib/trips/flight";
import { PRESENTATION_OPTIONS, SERVICE_EXTRAS, presentationAtIso, serviceExtrasLabel } from "@/lib/trips/service-extras";
import { SERVICE_MODE_LABEL, legacyServiceType, type CategoryKind, type ServiceMode } from "@/lib/pricing/category-catalog";

type Client = { id: string; name: string; trade_name?: string | null; type: string; document?: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null };
type Category = { id: string; name: string; description: string | null; passengers: number; kind: CategoryKind; photo_url: string | null; allows_km?: boolean };
type PriceRow = { category_id: string; service: string; enabled: boolean; client_price: number | null; partner_price: number | null };

const STEPS = ["Cliente", "Data e hora", "Veículo", "Detalhes", "Resumo"] as const;
const ALL_MODES: ServiceMode[] = ["transfer", "diaria_5h", "diaria_10h", "diaria_12h", "km"];
const input = PRIME_INPUT_CLASS;

const brl = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Nova corrida em 5 etapas, com cadastro rápido de cliente e escolha do veículo por cartões. */
export function TripWizard({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // Motorista já na criação (opcional): a corrida sai atribuída e ele recebe o aviso na hora.
  const { drivers: assignDrivers } = useAssignDrivers();
  const [driverId, setDriverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Cliente
  const [clients, setClients] = useState<Client[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [clientType, setClientType] = useState<"todos" | "PJ" | "PF">("todos");
  const [clientId, setClientId] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [nc, setNc] = useState({ type: "PJ" as "PJ" | "PF", name: "", document: "", whatsapp: "", email: "", address: "", cep: "" });
  const [cepBusy, setCepBusy] = useState(false);

  // 2. Data
  const today = saoPauloTodayYmd();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  // Vários dias seguidos (carro à disposição / diárias): uma corrida por dia, mesmo horário.
  const [multiDay, setMultiDay] = useState(false);
  const [lastDate, setLastDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [skipDays, setSkipDays] = useState<string[]>([]);
  // Pagamento na reserva (sinal / antecipado).
  const [prepaid, setPrepaid] = useState(false);
  // Pacote de vários dias: o valor digitado é o total do pacote (divide pelos dias) ou o de cada dia.
  const [pricePer, setPricePer] = useState<"total" | "dia">("total");
  // Corrida que já aconteceu (registrar depois): término e KM rodado.
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [doneEnd, setDoneEnd] = useState("");
  const [doneKm, setDoneKm] = useState("");
  const [prepay, setPrepay] = useState(() => emptyBookingPayment(saoPauloTodayYmd()));

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
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [otherPax, setOtherPax] = useState<string[]>([]);
  const [manualStops, setManualStops] = useState<EditableStop[]>([]);
  const [finalPerson, setFinalPerson] = useState(emptyFinalPerson());
  const [teamDir, setTeamDir] = useState<TeamDirection>("buscar");
  const teamShape = useMemo(() => teamTripShape(team, teamDir), [team, teamDir]);

  useEffect(() => setTeam([]), [clientId]);

  // Funcionário escolhido: endereço, nome, telefone e quantidade entram sozinhos.
  useEffect(() => {
    if (!teamShape) return;
    if (teamShape.originText) setOrigin({ text: teamShape.originText, lat: null, lng: null });
    if (teamShape.destinationText) setDest({ text: teamShape.destinationText, lat: null, lng: null });
    setPaxName(teamShape.passengerName);
    setPaxPhone(teamShape.passengerPhone ?? "");
    setPassengers((n) => Math.max(n, teamShape.passengerCount));
  }, [teamShape]);

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

  // KM mínimo da tabela do veículo escolhido (corridas por km).
  const kmMin = useMemo(() => {
    const c = prices.find((p) => p.category_id === categoryId && p.service === "km_minimo" && p.enabled);
    return c?.client_price != null && c.client_price > 0 ? c.client_price : null;
  }, [prices, categoryId]);

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

  const [kmEstimate, setKmEstimate] = useState<{ km: number | null; client: number; driver: number | null; bandeira?: string; minKm?: number | null } | null>(null);
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
          data?: { estimate?: { planned_km: number | null; client_amount: number; driver_amount?: number | null } | null; bandeira?: string; min_km?: number | null };
        };
        const e = json.data?.estimate;
        if (res.ok && json.success && e) setKmEstimate({ km: e.planned_km, client: e.client_amount, driver: e.driver_amount ?? null, bandeira: json.data?.bandeira, minKm: json.data?.min_km ?? null });
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
  /** Dias do pacote (de date até lastDate), menos os que foram desmarcados. Máx. 31. */
  const allDays = useMemo(() => (multiDay ? daysBetween(date, lastDate) : []), [multiDay, date, lastDate]);
  const days = useMemo(() => allDays.filter((d) => !skipDays.includes(d)), [allDays, skipDays]);
  const windowHours = useMemo(() => hoursBetween(time, endTime), [time, endTime]);
  const nDays = multiDay ? Math.max(1, days.length) : 1;
  const isPast = !multiDay && Boolean(scheduledIso) && new Date(String(scheduledIso)).getTime() < Date.now() - 10 * 60_000;
  const doneMode = isPast && alreadyDone;
  // "7.000,00" ou "7000,5" (digitado) e "1400.5" (vindo da tabela).
  const money = (v: string) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) || 0;
  /** Valor de cada dia (dia i): no modo "total", divide e joga os centavos que sobram no último dia. */
  const dayAmount = (v: string, i: number) => {
    const n = money(v);
    if (!n) return 0;
    if (!multiDay || pricePer === "dia") return n;
    const base = Math.floor((n * 100) / nDays) / 100;
    return i === nDays - 1 ? Math.round((n - base * (nDays - 1)) * 100) / 100 : base;
  };
  /** Total do pacote (cliente ou motorista). */
  const pkgTotal = (v: string) => (multiDay ? (pricePer === "dia" ? money(v) * nDays : money(v)) : money(v) * (roundTrip ? 2 : 1));
  const returnIso = roundTrip && returnDate && returnTime ? saoPauloDateAndTimeToUtcIso(returnDate, returnTime) : null;

  function missing(s: number): string[] {
    const m: string[] = [];
    if (s === 0 && !clientId) m.push("escolher o cliente");
    if (s === 1) {
      if (!scheduledIso) m.push(multiDay ? "primeiro dia e horário de início" : "data e horário");
      if (multiDay) {
        if (!lastDate || (date && lastDate <= date)) m.push("último dia (depois do primeiro)");
        else if (allDays.length > 31) m.push("no máximo 31 dias");
        if (!/^\d{2}:\d{2}$/.test(endTime)) m.push("horário de término");
        if (allDays.length && days.length === 0) m.push("pelo menos um dia marcado");
      }
      if (roundTrip && !returnIso) m.push("data e horário da volta");
      if (roundTrip && scheduledIso && returnIso && returnIso <= scheduledIso) m.push("volta depois da ida");
    }
    if (s === 2) {
      if (!categoryId) m.push("escolher o veículo");
      if (category && passengers > category.passengers) m.push(`no máximo ${category.passengers} passageiros nesse veículo`);
    }
    if (s === 1 && doneMode) {
      if (!/^\d{2}:\d{2}$/.test(doneEnd)) m.push("horário em que terminou");
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

  async function lookupCep() {
    const cep = nc.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepBusy(true);
    try {
      const res = await fetchWithSupabaseSession(`/api/integrations/viacep-lookup?cep=${cep}`, {}, "admin");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { logradouro?: string; bairro?: string; localidade?: string; uf?: string } };
      const d = json.data;
      if (res.ok && json.success && d) {
        const line = [d.logradouro, d.bairro, d.localidade && d.uf ? `${d.localidade}/${d.uf}` : d.localidade].filter(Boolean).join(", ");
        setNc((f) => ({ ...f, address: line ? `${line}, ` : f.address }));
      }
    } finally {
      setCepBusy(false);
    }
  }

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
          address_line: nc.address.trim() || null,
          postal_code: nc.cep.trim() || null,
          registry_status: nc.document.trim() && nc.address.trim() && nc.email.trim() ? "completo" : "incompleto"
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
    setNc({ type: "PJ", name: "", document: "", whatsapp: "", email: "", address: "", cep: "" });
    setStep(1);
  }

  async function submit() {
    if (!client || !category || !scheduledIso) return;
    const semEndereco = teamMissingAddress(team);
    if (semEndereco.length) {
      setError(`Falta o endereço de: ${semEndereco.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError(null);
    const runDays = multiDay ? days : [date];
    const groupId = multiDay && days.length > 1 ? crypto.randomUUID() : undefined;
    const buildBody = (day: string, i: number) => {
    const at = saoPauloDateAndTimeToUtcIso(day, time) ?? scheduledIso;
    const ref = osRef.trim() ? (multiDay ? `${osRef.trim()}-D${i + 1}` : osRef.trim()) : "";
    const pkg = multiDay
      ? `Carro à disposição: dia ${i + 1} de ${runDays.length} (${runDays.map(brDay).join(", ")}) · das ${time} às ${endTime}`
      : "";
    const notesFull = [ref ? `O.S./Ref.: ${ref}` : "", pkg, notes.trim()].filter(Boolean).join("\n");
    return {
      client_id: client.id,
      service_type: legacyServiceType(category.kind, mode),
      vehicle_category_id: category.id,
      service_mode: mode,
      scheduled_at: at,
      origin_text: origin.text.trim(),
      origin_lat: origin.lat ?? undefined,
      origin_lng: origin.lng ?? undefined,
      destination_text: dest.text.trim(),
      destination_lat: dest.lat ?? undefined,
      destination_lng: dest.lng ?? undefined,
      passenger_name:
        [paxName.trim(), ...(team.length ? [] : otherPax.slice(0, Math.max(0, passengers - 1)).map((x) => x.trim()))].filter(Boolean).join(", ") ||
        undefined,
      passenger_phone: paxPhone.trim() || undefined,
      passenger_count: team.length
        ? Math.max(passengers, team.length +
              stopsForApi(manualStops, { person: finalPerson, dest })
                .filter((x) => x.passenger_name && !team.some((m) => m.name.trim().toLowerCase().startsWith(x.passenger_name.trim().toLowerCase().split(/\s+/)[0])))
                .reduce((n, x) => n + (x.people ?? 1), 0))
        : passengers,
      ...(teamShape?.pickupStops ? { trip_pickup_stops: teamShape.pickupStops } : {}),
      ...(teamShape?.dropoffStops
        ? { trip_dropoff_stops: teamShape.dropoffStops }
        : stopsForApi(manualStops).length
          ? { trip_dropoff_stops: stopsForApi(manualStops, { person: finalPerson, dest }) }
          : {}),
      flight_number: normalizeFlightNumber(flight) ?? undefined,
      notes: notesFull || undefined,
      ...(groupId ? { booking_group_id: groupId } : {}),
      client_amount: dayAmount(clientAmount, i) || undefined,
      driver_amount: dayAmount(driverAmount, i) || undefined,
      dispatch_mode: "directed" as const,
      presentation_minutes: presentation,
      service_extras: extras,
      ...(!multiDay && roundTrip && returnIso ? { round_trip: true, return_scheduled_at: returnIso } : {})
    };
    };
    const created: { id: string; status?: string; returnId?: string | null }[] = [];
    let assignNote = "";
    for (let i = 0; i < runDays.length; i++) {
      const res = await fetchWithSupabaseSession("/api/trips", { method: "POST", body: JSON.stringify(buildBody(runDays[i], i)) }, "admin");
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { id: string; operational_status?: string; trip_id_return?: string | null };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data?.id) {
        setBusy(false);
        const why = json.error?.message ?? "Não foi possível criar a corrida.";
        setError(
          created.length
            ? `Foram criados ${created.length} de ${runDays.length} dias. Parou no dia ${brDay(runDays[i])}: ${why} Confira na Agenda antes de tentar de novo.`
            : why
        );
        return;
      }
      created.push({ id: json.data.id, status: json.data.operational_status, returnId: json.data.trip_id_return });
    }
    let payNote = "";
    const payBody = prepaid ? bookingPaymentBody(prepay, created.flatMap((c) => [c.id, c.returnId].filter(Boolean) as string[])) : null;
    if (payBody) {
      const pr = await fetchWithSupabaseSession(`/api/trips/${created[0].id}/payments`, { method: "POST", body: JSON.stringify(payBody) }, "admin");
      const pj = (await pr.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
      if (!pr.ok || !pj.success) payNote = `O pagamento antecipado não foi salvo (${pj.error?.message ?? "erro"}). Registre na corrida, em “Pagamento do cliente”.`;
    }
    if (doneMode) {
      // Já aconteceu: vira concluída direto (sem mandar O.S. ao motorista) e vai para "Aprovar corridas".
      const startIso = String(scheduledIso);
      let endIso = saoPauloDateAndTimeToUtcIso(date, doneEnd) ?? startIso;
      if (new Date(endIso) <= new Date(startIso)) endIso = new Date(new Date(endIso).getTime() + 86_400_000).toISOString();
      const kmN = money(doneKm);
      const rd = await fetchWithSupabaseSession(
        `/api/trips/${created[0].id}/register-done`,
        { method: "POST", body: JSON.stringify({ driver_id: driverId || null, started_at: startIso, ended_at: endIso, ...(kmN > 0 ? { km: kmN } : {}) }) },
        "admin"
      );
      const rj = (await rd.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
      setBusy(false);
      onDone?.();
      window.alert(
        rd.ok && rj.success
          ? "Corrida registrada como já feita. Confira o KM e os valores em “Aprovar corridas”."
          : `Corrida criada, mas não deu para marcar como feita: ${rj.error?.message ?? "erro"}. Abra a corrida e ajuste.`
      );
      router.push((rd.ok ? "/conferencia" : `/agenda?trip=${created[0].id}#trip-detail`) as Route);
      router.refresh();
      return;
    }
    if (driverId) {
      for (const c of created) {
        for (const id of [c.id, c.returnId].filter(Boolean) as string[]) {
          if (c.status === "requested") await fetchWithSupabaseSession(`/api/trips/${id}/approve`, { method: "POST" }, "admin");
          let d = await fetchWithSupabaseSession(`/api/trips/${id}/dispatch-directed`, { method: "POST", body: JSON.stringify({ driver_id: driverId }) }, "admin");
          let dj = (await d.json().catch(() => ({}))) as { success?: boolean; error?: { code?: string; message?: string } };
          // Motorista com o app fechado ou agenda cheia: a central confirma e atribui mesmo assim.
          if ((!d.ok || !dj.success) && (dj.error?.code === "DRIVER_OFFLINE" || dj.error?.code === "DISPATCH_CONFLICT")) {
            const why = dj.error?.code === "DRIVER_OFFLINE" ? "O motorista está com o aplicativo fechado e a corrida é para agora." : (dj.error?.message ?? "O motorista já tem corrida nesse horário.");
            if (window.confirm(`${why}\n\nAtribuir mesmo assim? (ex.: ele já está fazendo o serviço)`)) {
              d = await fetchWithSupabaseSession(`/api/trips/${id}/dispatch-directed`, { method: "POST", body: JSON.stringify({ driver_id: driverId, force: true }) }, "admin");
              dj = (await d.json().catch(() => ({}))) as { success?: boolean; error?: { code?: string; message?: string } };
            }
          }
          if (!d.ok || !dj.success) assignNote = dj.error?.message ?? "Não foi possível atribuir o motorista.";
        }
      }
    }
    setBusy(false);
    onDone?.();
    if (payNote) window.alert(payNote);
    if (assignNote) window.alert(`Corrida(s) criada(s), mas o motorista não foi atribuído em todas: ${assignNote}`);
    else if (created.length > 1) window.alert(`${created.length} diárias criadas (${runDays.map(brDay).join(", ")}).`);
    router.push(`/agenda?trip=${created[0].id}#trip-detail` as Route);
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
                <label className="grid gap-1 text-sm">
                  <span>CEP</span>
                  <input
                    className={input}
                    inputMode="numeric"
                    placeholder="29000-000"
                    value={nc.cep}
                    onChange={(e) => setNc({ ...nc, cep: e.target.value })}
                    onBlur={() => void lookupCep()}
                  />
                  {cepBusy ? <span className="text-xs text-prime-muted">Buscando endereço…</span> : null}
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Endereço (rua, número, bairro, cidade)</span>
                  <input className={input} value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} />
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
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <TypedDateTime label={multiDay ? "Primeiro dia e hora de início" : "Ida"} date={date} time={time} today={today} onDate={setDate} onTime={setTime} autoFocus />
              {scheduledIso ? <p className="text-sm font-medium text-emerald-800">Embarque: {formatBrDateTime(scheduledIso)}</p> : null}
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={multiDay}
                  onChange={(e) => {
                    setMultiDay(e.target.checked);
                    if (e.target.checked) setRoundTrip(false);
                    setSkipDays([]);
                  }}
                />
                Vários dias seguidos (carro à disposição / diárias)
              </label>
              {multiDay ? (
                <div className="grid gap-3 rounded-xl border border-prime-gold bg-[#FBF7EC] p-3">
                  <p className="text-xs text-prime-muted">
                    Em cima você escolhe o <b>primeiro dia</b> e o horário de <b>início</b>. Aqui, o último dia e até que horas o carro fica com o cliente. Vira uma corrida
                    por dia, no mesmo horário.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Último dia</span>
                      <input type="date" className={input} min={date || today} value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Disponível até as</span>
                      <input type="time" className={input} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </label>
                  </div>
                  {allDays.length ? (
                    <div>
                      <p className="mb-1 text-xs text-prime-muted">Toque num dia para tirar (ex.: domingo sem atendimento).</p>
                      <div className="flex flex-wrap gap-1.5">
                        {allDays.map((d) => {
                          const on = !skipDays.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setSkipDays((xs) => (on ? [...xs, d] : xs.filter((x) => x !== d)))}
                              className={`rounded-lg px-2.5 py-1.5 text-xs ring-1 ${on ? "bg-[#111] text-[#fff] ring-[#111]" : "text-prime-muted line-through ring-prime-border"}`}
                            >
                              {weekday(d)} {brDay(d)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {days.length && time && endTime ? (
                    <p className="text-sm font-medium text-emerald-800">
                      {days.length} dia{days.length > 1 ? "s" : ""} · das {time} às {endTime}
                      {windowHours != null ? ` (${windowHours.toLocaleString("pt-BR")}h por dia)` : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {isPast ? (
                <div className="grid gap-3 rounded-xl border-2 border-sky-300 bg-sky-50 p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={alreadyDone}
                      onChange={(e) => {
                        setAlreadyDone(e.target.checked);
                        if (e.target.checked) setRoundTrip(false);
                      }}
                    />
                    Esta corrida já foi feita (registrar depois)
                  </label>
                  {alreadyDone ? (
                    <>
                      <p className="text-xs text-prime-muted">
                        O horário acima é quando começou. Ela entra como concluída, calcula os valores pela tabela e vai para “Aprovar corridas”. O motorista não recebe O.S.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="font-medium">Terminou às</span>
                          <input type="time" className={input} value={doneEnd} onChange={(e) => setDoneEnd(e.target.value)} />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="font-medium">KM rodado (se souber)</span>
                          <input className={input} inputMode="decimal" placeholder="Ex.: 20" value={doneKm} onChange={(e) => setDoneKm(e.target.value)} />
                        </label>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-prime-muted">O horário escolhido já passou. Se a corrida já aconteceu, marque acima para lançar com o KM e o fim.</p>
                  )}
                </div>
              ) : null}
              {!multiDay && !doneMode ? (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
                Tem volta (ida e volta)
              </label>
              ) : null}
              {!multiDay && roundTrip ? (
                <>
                  <TypedDateTime label="Volta" date={returnDate} time={returnTime} today={today} onDate={setReturnDate} onTime={setReturnTime} />
                  <p className="text-xs text-prime-muted">A volta vira uma segunda corrida, com o trajeto invertido.</p>
                </>
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
                      // Prime Essencial: só por km.
                      setMode(
                        c.allows_km
                          ? "km"
                          : multiDay
                            ? suggestDiaria(windowHours, modes)
                            : modes.find((m) => m !== "km") ?? "transfer"
                      );
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
                  {ALL_MODES.filter((m) => (category.allows_km ? m === "km" : m !== "km")).map((m) => {
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

                <div className="mt-3 rounded-2xl border-2 border-prime-gold bg-[#FBF7EC] p-4">
                  <p className="text-base font-semibold">{multiDay ? `Valores do pacote (${nDays} dias)` : "Valores desta corrida"}</p>
                  {multiDay ? (
                    <div className="mt-2 grid gap-2">
                      <div className="inline-flex w-fit rounded-xl bg-white p-1 text-sm ring-1 ring-prime-border">
                        {(
                          [
                            ["total", "Digitar o valor TOTAL do pacote"],
                            ["dia", "Digitar o valor de CADA dia"]
                          ] as const
                        ).map(([k, l]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setPricePer(k)}
                            className={`rounded-lg px-3 py-1.5 ${pricePer === k ? "bg-[#111] font-semibold text-[#fff]" : "text-prime-muted"}`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      {money(clientAmount) > 0 ? (
                        <p className="text-sm font-medium text-emerald-800">
                          Cliente: {brl(pkgTotal(clientAmount))} no total = {brl(dayAmount(clientAmount, 0))} por dia × {nDays}
                          {money(driverAmount) > 0 ? ` · Motorista: ${brl(pkgTotal(driverAmount))} no total = ${brl(dayAmount(driverAmount, 0))} por dia` : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-xs text-prime-muted">
                    {mode === "km"
                      ? `Por km: deixe em branco para calcular pelo km rodado, ou digite um valor fechado.${kmMin ? ` KM mínimo deste cliente: ${kmMin} km (corrida menor cobra ${kmMin} km).` : " Este cliente não tem KM mínimo cadastrado."}`
                      : tablePrice
                        ? "Já preenchido com a tabela do cliente. Pode mudar."
                        : "Sem tabela para este serviço: digite os valores combinados."}
                  </p>
                  {mode === "km" ? <KmTable prices={prices} categoryId={categoryId} kmMin={kmMin} /> : null}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">{mode === "km" ? "Valor fechado do cliente (opcional)" : "Cliente paga (R$)"}</span>
                      <input
                        className={`${input} text-xl font-semibold`}
                        inputMode="decimal"
                        placeholder={mode === "km" ? "Por km" : "0,00"}
                        value={clientAmount}
                        onChange={(e) => setClientAmount(e.target.value)}
                      />
                      {tablePrice?.client_price != null ? <span className="text-xs text-emerald-700">Tabela: {brl(tablePrice.client_price)}</span> : null}
                      {mode === "km" && Number(clientAmount.replace(",", ".")) > 0 && Number(clientAmount.replace(",", ".")) < 15 ? (
                        <span className="text-xs font-semibold text-red-700">Isso parece o preço por km. Aqui vai o valor TOTAL da corrida — deixe em branco para cobrar por km.</span>
                      ) : null}
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">{mode === "km" ? "Valor fechado do motorista (opcional)" : "Motorista recebe (R$)"}</span>
                      <input
                        className={`${input} text-xl font-semibold`}
                        inputMode="decimal"
                        placeholder={mode === "km" ? "Por km" : "0,00"}
                        value={driverAmount}
                        onChange={(e) => setDriverAmount(e.target.value)}
                      />
                      {tablePrice?.partner_price != null ? <span className="text-xs text-emerald-700">Tabela do parceiro: {brl(tablePrice.partner_price)}</span> : null}
                    </label>
                  </div>
                  {Number(clientAmount.replace(",", ".")) > 0 && Number(driverAmount.replace(",", ".")) > 0 ? (
                    <p className="mt-2 text-sm">
                      Margem da Prime:{" "}
                      <b>{brl(Number(clientAmount.replace(",", ".")) - Number(driverAmount.replace(",", ".")))}</b>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 4. DETALHES */}
        {step === 3 && client ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 md:col-span-2">
              {client.type === "PJ" ? (
                <TeamPassengerPicker clientId={client.id} team={team} onTeamChange={setTeam} direction={teamDir} onDirectionChange={setTeamDir} devFallbackRole="admin" />
              ) : null}
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
              {!teamShape?.dropoffStops ? (
                <div className="grid gap-2 border-l-2 border-dashed border-prime-gold pl-3">
                  {team.length ? <p className="text-xs text-prime-muted">Paradas depois do embarque (pessoa não cadastrada ou outro endereço):</p> : null}
                  <DropoffStopsEditor stops={manualStops} onChange={setManualStops} />
                </div>
              ) : null}
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
                label={manualStops.length ? "Destino final" : "Destino"}
                required
                placeholder="Ex.: Hotel, empresa ou endereço"
                value={dest.text}
                hasCoords={dest.lat != null}
                onChange={(t) => setDest({ text: t, lat: null, lng: null })}
                onPlaceSelect={(p) => setDest({ text: p.displayName, lat: p.lat, lng: p.lng })}
                onCoordsClear={() => setDest((o) => ({ ...o, lat: null, lng: null }))}
                devFallbackRole="admin"
              />
              {manualStops.length && !teamShape?.dropoffStops ? <FinalStopPersonFields value={finalPerson} onChange={setFinalPerson} /> : null}
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
            {!team.length ? (
              <div className="grid gap-2 rounded-xl bg-prime-bg p-3 md:col-span-2">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-semibold">Quantos passageiros?</span>
                  <button type="button" className="h-8 w-8 rounded-full bg-white ring-1 ring-prime-border" onClick={() => setPassengers((n) => Math.max(1, n - 1))}>
                    −
                  </button>
                  <span className="w-6 text-center text-lg font-semibold">{passengers}</span>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-full bg-white ring-1 ring-prime-border"
                    onClick={() => setPassengers((n) => Math.min(category?.passengers ?? 60, n + 1))}
                  >
                    +
                  </button>
                  <span className="text-xs text-prime-muted">máx. {category?.passengers ?? "—"}</span>
                </div>
                {passengers > 1 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: passengers - 1 }, (_, i) => (
                      <PassengerAutocompleteInput
                        key={i}
                        clientId={client.id}
                        label={`Passageiro ${i + 2}`}
                        value={otherPax[i] ?? ""}
                        onChange={(v) => setOtherPax((arr) => {
                          const next = [...arr];
                          next[i] = v;
                          return next;
                        })}
                        devFallbackRole="admin"
                      />
                    ))}
                    <p className="text-xs text-prime-muted sm:col-span-2">Os nomes vão para o motorista, a O.S. e a fatura. Pode deixar em branco quem ainda não sabe.</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <label className="grid gap-1 text-sm">
              <span>Nº do voo (se for aeroporto)</span>
              <input className={input} placeholder="Ex.: LA3456" value={flight} onChange={(e) => setFlight(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>O.S. ou referência do cliente</span>
              <input className={input} value={osRef} onChange={(e) => setOsRef(e.target.value)} />
            </label>
            {mode === "km" ? (
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 md:col-span-2">
                {kmEstimate ? (
                  <>
                    <b>Estimativa por km: {brl(kmEstimate.client)}</b> · cerca de {kmEstimate.km?.toLocaleString("pt-BR")} km · {kmEstimate.bandeira}
                    {kmEstimate.driver != null ? ` · motorista ${brl(kmEstimate.driver)}` : ""}. O valor final sai do km rodado.
                  </>
                ) : origin.lat == null || dest.lat == null ? (
                  "Escolha embarque e destino na lista de sugestões para calcular a estimativa por km."
                ) : (
                  "Sem preço por km na tabela deste cliente para esta categoria."
                )}
              </div>
            ) : null}
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
                <dd className="font-semibold">
                  {multiDay && days.length
                    ? `${days.length} dias: ${days.map(brDay).join(", ")} · das ${time} às ${endTime}`
                    : scheduledIso
                      ? formatBrDateTime(scheduledIso)
                      : "—"}
                </dd>
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
                    {money(clientAmount)
                      ? multiDay
                        ? `Total ${brl(pkgTotal(clientAmount))} · ${brl(dayAmount(clientAmount, 0))} por dia`
                        : brl(money(clientAmount))
                      : mode === "km" && kmEstimate
                        ? `≈ ${brl(kmEstimate.client)} (por km)`
                        : "Tabela / a combinar"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-prime-muted">Motorista recebe</dt>
                  <dd className="font-semibold">
                    {money(driverAmount)
                      ? multiDay
                        ? `Total ${brl(pkgTotal(driverAmount))} · ${brl(dayAmount(driverAmount, 0))} por dia`
                        : brl(money(driverAmount))
                      : mode === "km" && kmEstimate?.driver != null
                        ? `≈ ${brl(kmEstimate.driver)} (por km)`
                        : "Tabela"}
                  </dd>
                </div>
              </div>
            </dl>
            <div className="rounded-2xl border border-prime-border bg-white p-4 md:col-span-2">
              <label className="flex items-center gap-2 text-base font-semibold">
                <input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} />
                Cliente já pagou algo na reserva? (sinal / antecipado)
              </label>
              {prepaid ? (
                <div className="mt-3">
                  <BookingPaymentFields
                    value={prepay}
                    onChange={setPrepay}
                    total={pkgTotal(clientAmount) || null}
                  />
                  {Number(clientAmount.replace(",", ".")) > 0 && bookingPaymentBody(prepay) ? (
                    <p className="mt-2 text-sm font-medium text-emerald-800">
                      Falta receber depois:{" "}
                      {brl(
                        Math.max(
                          0,
                          pkgTotal(clientAmount) - (bookingPaymentBody(prepay)?.amount ?? 0)
                        )
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border-2 border-prime-gold bg-[#FBF7EC] p-4 md:col-span-2">
              <p className="text-base font-semibold">Motorista</p>
              <p className="text-xs text-prime-muted">
                {driverId
                  ? "Ao criar, a corrida já vai para ele e o celular dele avisa. Se ele tiver outra corrida no mesmo horário, o sistema avisa e não atribui."
                  : "Toque no motorista ou deixe “Escolher depois”."}
              </p>
              <div className="mt-3 grid max-h-[26rem] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setDriverId("")}
                  className={`flex items-center gap-3 rounded-xl border bg-white p-3 text-left ${driverId === "" ? "border-prime-gold ring-2 ring-prime-gold" : "border-prime-border"}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-prime-bg text-lg">⏳</span>
                  <span>
                    <span className="block font-semibold">Escolher depois</span>
                    <span className="block text-xs text-prime-muted">A corrida fica aguardando motorista</span>
                  </span>
                </button>
                {[...assignDrivers]
                  .sort((a, b) => Number(Boolean(b.categoryIds?.includes(category.id))) - Number(Boolean(a.categoryIds?.includes(category.id))))
                  .map((d) => {
                    const sel = driverId === d.id;
                    const other = Boolean(d.categoryIds?.length && !d.categoryIds.includes(category.id));
                    const online = d.status === "online";
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDriverId(d.id)}
                        className={`flex items-center gap-3 rounded-xl border bg-white p-3 text-left ${sel ? "border-prime-gold ring-2 ring-prime-gold" : "border-prime-border hover:border-prime-gold"}`}
                      >
                        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#111] text-sm font-bold text-prime-gold">
                          {d.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                          {online ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {sel ? "✓ " : ""}
                            {d.name}
                          </span>
                          <span className="block truncate text-xs text-prime-muted">{d.vehicle ? `${d.vehicle.model} · ${d.vehicle.plate}` : "Sem carro cadastrado"}</span>
                          {other ? <span className="block text-xs text-amber-700">Carro de outra categoria</span> : null}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
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
            <button type="button" disabled={busy || (doneMode && !driverId)} className="btn-primary ml-auto disabled:opacity-50" onClick={() => void submit()}>
              {busy
                ? "Criando…"
                : doneMode
                  ? driverId
                    ? "Registrar corrida já feita"
                    : "Escolha o motorista que fez a corrida"
                  : `${multiDay && days.length > 1 ? `Criar ${days.length} diárias` : roundTrip ? "Criar ida e volta" : "Criar corrida"}${driverId ? " e enviar ao motorista" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


/** Corrida por km: mostra o preço por km de cada bandeira e o mínimo, para não digitar no lugar errado. */
function KmTable({ prices, categoryId, kmMin }: { prices: PriceRow[]; categoryId: string; kmMin: number | null }) {
  const get = (s: string) => prices.find((p) => p.category_id === categoryId && p.service === s && p.enabled);
  const b1 = get("km_b1");
  const b2 = get("km_b2");
  if (!b1 && !b2) return <p className="mt-3 text-sm text-amber-800">Sem preço por km na tabela deste cliente para este veículo.</p>;
  return (
    <div className="mt-3 grid gap-2 rounded-xl bg-white p-3 text-sm sm:grid-cols-3">
      <div>
        <p className="text-xs text-prime-muted">Bandeira 1 (06h–18h59)</p>
        <p className="font-semibold">{b1?.client_price != null ? `${brl(b1.client_price)}/km` : "—"}</p>
        {b1?.partner_price != null ? <p className="text-xs text-prime-muted">motorista {brl(b1.partner_price)}/km</p> : null}
      </div>
      <div>
        <p className="text-xs text-prime-muted">Bandeira 2 (19h–05h59)</p>
        <p className="font-semibold">{b2?.client_price != null ? `${brl(b2.client_price)}/km` : "—"}</p>
        {b2?.partner_price != null ? <p className="text-xs text-prime-muted">motorista {brl(b2.partner_price)}/km</p> : null}
      </div>
      <div>
        <p className="text-xs text-prime-muted">KM mínimo</p>
        <p className="font-semibold">{kmMin ? `${kmMin} km` : "sem mínimo"}</p>
        {kmMin && b1?.client_price != null ? <p className="text-xs text-prime-muted">mínimo de {brl(kmMin * b1.client_price)} (bandeira 1)</p> : null}
      </div>
    </div>
  );
}

/** Dias (YYYY-MM-DD) de a até b, inclusive. Vazio se inválido; até 62 dias para mostrar o erro de limite. */
function daysBetween(a: string, b: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || b < a) return [];
  const out: string[] = [];
  const d = new Date(`${a}T12:00:00Z`);
  while (out.length < 62) {
    const ymd = d.toISOString().slice(0, 10);
    if (ymd > b) break;
    out.push(ymd);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function hoursBetween(start: string, end: string): number | null {
  const m1 = /^(\d{2}):(\d{2})$/.exec(start);
  const m2 = /^(\d{2}):(\d{2})$/.exec(end);
  if (!m1 || !m2) return null;
  let mins = Number(m2[1]) * 60 + Number(m2[2]) - (Number(m1[1]) * 60 + Number(m1[2]));
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

const brDay = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const weekday = (ymd: string) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(`${ymd}T12:00:00Z`).getUTCDay()];

/** Diária que cobre a janela pedida (5h, 10h ou 12h), preferindo a que tem preço na tabela do cliente. */
function suggestDiaria(hours: number | null, released: ServiceMode[]): ServiceMode {
  const want: ServiceMode = hours == null || hours > 10 ? "diaria_12h" : hours > 5 ? "diaria_10h" : "diaria_5h";
  if (released.includes(want) || !released.some((m) => m.startsWith("diaria"))) return want;
  const order: ServiceMode[] = ["diaria_5h", "diaria_10h", "diaria_12h"];
  return order.slice(order.indexOf(want)).find((m) => released.includes(m)) ?? want;
}
