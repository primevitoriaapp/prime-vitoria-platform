"use client";

import { useEffect, useState } from "react";

import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import { driverPrimaryActionLabel } from "@/lib/trips/driver-step-copy";
import { confirmDriverStatusTransition } from "@/lib/trips/driver-status-confirm";
import { buildNavigationLinksToPoint } from "@/lib/trips/driver-nav-links";
import { formatDriverGpsKm, type DriverTripGpsState } from "@/lib/trips/driver-complete-km";
import { SERVICE_EXTRAS, presentationAtIso } from "@/lib/trips/service-extras";
import { flightTrackerUrl } from "@/lib/trips/flight";
import { allPickupStopsCompleted, nextIncompletePickupStopIndex, parseTripPickupStops, pickupStopNavPoint } from "@/lib/trips/trip-pickup-stops";
import { DriverPickupStopsPanel } from "@/components/driver-pickup-stops-panel";
import { DriverDropoffStopsPanel } from "@/components/driver-dropoff-stops-panel";
import { DriverPassengerLink } from "@/components/driver-passenger-link";
import { linkPhones } from "@/lib/ui/link-phones";
import { nextPendingDropoffIndex, parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";
import { tripContacts, tripPeopleLabel, type TripContact } from "@/lib/trips/trip-contacts";
import { DriverTripExpenses } from "@/components/trip-expenses";
import { ReceptiveSignButton, needsReceptiveSign } from "@/components/receptive-sign";
import { DriverHomeMap, MapSafe } from "@/components/driver-home-map";
import { SwipeToConfirm } from "@/components/swipe-to-confirm";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

const TZ = "America/Sao_Paulo";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** "faltam 3h40", "faltam 25 min", "é agora", "atrasado 12 min". */
function untilLabel(iso: string, now: Date): { text: string; tone: "far" | "soon" | "late" } {
  const min = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (min > 59) return { text: `faltam ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`, tone: "far" };
  if (min > 2) return { text: `faltam ${min} min`, tone: "soon" };
  if (min >= -2) return { text: "é agora", tone: "soon" };
  return { text: `atrasado ${-min} min`, tone: "late" };
}

function waPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

const first = (s?: string | null) => String(s ?? "").trim().split(/\s+/)[0] ?? "";
const place = (t?: string | null) => String(t ?? "").split(",")[0].trim();
const rest = (t?: string | null) => String(t ?? "").split(",").slice(1, 3).join(",").trim();

/** Modo noite (18h às 6h em Vitória): tela escura, como nos apps de motorista. */
function isNight(now: Date) {
  const h = Number(now.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }));
  return h >= 18 || h < 6;
}

type Props = {
  trip: Trip;
  isBusy: boolean;
  waitElapsedLabel: string | null;
  waitBusy: boolean;
  gps: DriverTripGpsState;
  devFallbackRole: "motorista" | "admin";
  onStatus: (tripId: string, to: TripOperationalStatus) => void;
  onWaitStart: (tripId: string) => void;
  onWaitStop: (tripId: string) => void;
  onCompletePickupStop: (tripId: string, idx: number) => void;
  onTripChanged?: () => void;
  message?: string | null;
};

type Sheet = { title: string; items: { key: string; label: string; sub?: string; href: string; external?: boolean }[] } | null;

/**
 * Modo corrida (depois de "A caminho"): mapa em cima, um cartão só com a etapa atual,
 * três botões (Navegar, Ligar, Mensagem) e a barra de deslizar no rodapé.
 * A ordem das paradas é sempre a do cliente.
 */
export function DriverTripFocus({ trip, isBusy, gps, devFallbackRole, onStatus, onCompletePickupStop, onTripChanged, message }: Props) {
  const s = trip.operational_status;
  const next = driverNextStatuses(s)[0];
  const others = driverNextStatuses(s).slice(1);
  const pickups = parseTripPickupStops(trip.trip_pickup_stops);
  const multiPickup = pickups.length > 1;
  const pickupIdx = multiPickup ? nextIncompletePickupStopIndex(pickups) : null;
  const pickupsDone = !multiPickup || allPickupStopsCompleted(pickups);
  const drops = parseDropoffStops(trip.trip_dropoff_stops);
  const dropIdx = drops.length ? nextPendingDropoffIndex(drops) : null;
  const nextDrop = dropIdx != null && dropIdx >= 0 ? drops[dropIdx] : null;
  const traveling = s === "in_progress";
  const presentation = presentationAtIso(trip.scheduled_at, (trip as { presentation_minutes?: number | null }).presentation_minutes);
  const extras = (trip as { service_extras?: string[] | null }).service_extras ?? [];
  const blockStart = next === "in_progress" && !pickupsDone;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [details, setDetails] = useState(false);
  const [dropBusy, setDropBusy] = useState(false);
  const [dropErr, setDropErr] = useState<string | null>(null);
  const night = isNight(now);

  const pickupAt = presentation ?? trip.scheduled_at;
  const until = untilLabel(pickupAt, now);
  const tooEarly = s === "on_the_way" && new Date(pickupAt).getTime() - now.getTime() > 90 * 60000;

  // Para onde ir agora.
  const target = traveling
    ? nextDrop
      ? { lat: nextDrop.lat ?? null, lng: nextDrop.lng ?? null, label: nextDrop.address_text }
      : { lat: trip.destination_lat, lng: trip.destination_lng, label: trip.destination_text }
    : multiPickup && pickupIdx != null
      ? pickupStopNavPoint(pickups[pickupIdx])
      : { lat: trip.origin_lat, lng: trip.origin_lng, label: trip.origin_text };

  // Quem é a pessoa desta etapa (para Ligar / Mensagem).
  const people = tripContacts(trip);
  const withPhone = people.filter((p) => p.phone);
  const focusPerson: TripContact | null = traveling && nextDrop ? (people.find((p) => p.name === (nextDrop.passenger_name || "")) ?? null) : null;
  const contactsNow = focusPerson?.phone ? [focusPerson] : withPhone;

  // Textos do cartão.
  const totalDrops = drops.length;
  const eyebrow = traveling
    ? nextDrop
      ? nextDrop.final
        ? "Destino final · deixar"
        : `Parada ${(dropIdx ?? 0) + 1} de ${totalDrops} · deixar`
      : "Levar para o destino"
    : s === "arrived"
      ? "Aguardando os passageiros"
      : multiPickup && pickupIdx != null
        ? `Buscar no embarque ${pickupIdx + 1} de ${pickups.length}`
        : "Buscar no embarque";
  const title = traveling
    ? nextDrop?.passenger_name
      ? first(nextDrop.passenger_name)
      : place(target.label)
    : s === "arrived"
      ? tripPeopleLabel(trip) || "Passageiro"
      : multiPickup && pickupIdx != null
        ? pickups[pickupIdx].passenger_name || place(target.label)
        : place(target.label);
  const subtitle = traveling && nextDrop?.passenger_name ? [place(target.label), rest(target.label)].filter(Boolean).join(" · ") : s === "arrived" ? `${place(trip.origin_text)} · horário ${hhmm(trip.scheduled_at)}` : rest(target.label);
  const afterDrop = traveling && dropIdx != null && dropIdx >= 0 ? drops.slice(dropIdx + 1).find((d) => !d.dropped_at) : null;

  // Faixa de progresso: embarque → paradas → destino.
  const strip: { key: string; label: string; state: "done" | "now" | "todo" }[] = [
    { key: "emb", label: "Embarque", state: traveling ? "done" : "now" },
    ...(drops.length
      ? drops.map((d, i) => ({ key: `d${i}`, label: first(d.passenger_name) || (d.final ? "Destino" : `Parada ${i + 1}`), state: (d.dropped_at ? "done" : traveling && i === dropIdx ? "now" : "todo") as "done" | "now" | "todo" }))
      : [{ key: "dest", label: "Destino", state: (traveling ? "now" : "todo") as "done" | "now" | "todo" }])
  ];

  function openNav() {
    const links = buildNavigationLinksToPoint(target);
    setSheet({
      title: `Navegar até ${title}`,
      items: links.map((l) => ({ key: l.id, label: l.label, href: l.href, external: l.id !== "waze" }))
    });
  }
  function openCall() {
    if (contactsNow.length === 1 && contactsNow[0].phone) {
      window.location.href = `tel:${contactsNow[0].phone}`;
      return;
    }
    setSheet({ title: "Ligar para", items: contactsNow.map((c) => ({ key: `${c.role}-${c.name}`, label: c.name, sub: `${c.role} · ${c.phone}`, href: `tel:${c.phone}` })) });
  }
  function openMsg(text?: string) {
    const q = text ? `?text=${encodeURIComponent(text)}` : "";
    if (contactsNow.length === 1 && contactsNow[0].phone) {
      window.open(`https://wa.me/${waPhone(String(contactsNow[0].phone))}${q}`, "_blank", "noopener");
      return;
    }
    setSheet({
      title: "Mensagem para",
      items: contactsNow.map((c) => ({ key: `${c.role}-${c.name}`, label: c.name, sub: c.role, href: `https://wa.me/${waPhone(String(c.phone))}${q}`, external: true }))
    });
  }

  async function dropCurrent() {
    if (dropIdx == null || dropIdx < 0) return;
    setDropBusy(true);
    setDropErr(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${trip.id}/dropoff-complete`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: dropIdx }) },
      devFallbackRole
    ).catch(() => null);
    const j = res ? ((await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }) : {};
    setDropBusy(false);
    if (!res?.ok || !j.success) {
      setDropErr(j.error?.message ?? "Não foi possível marcar. Tente de novo.");
      return;
    }
    onTripChanged?.();
  }

  // Barra de deslizar: o que ela faz agora.
  const dropMode = traveling && nextDrop && !nextDrop.final;
  const swipeLabel = dropMode
    ? `Deslize: ${first(nextDrop?.passenger_name) || "parada feita"} desceu`
    : next === "arrived"
      ? "Deslize ao chegar no local"
      : next === "in_progress"
        ? "Deslize: passageiros a bordo"
        : next === "completed"
          ? "Deslize para finalizar"
          : next
            ? driverPrimaryActionLabel(s, next)
            : "";

  // Cores (dia / noite).
  const c = night
    ? { sheet: "bg-[#17181B]", text: "text-[#FFFFFF]", sub: "text-[#B4B8BF]", eyebrow: "text-[#E2C673]", chip: "bg-[#3B331C] text-[#F3DFA2]", chip2: "bg-[#26282D] text-[#D6D9DE]", btn: "border-[#34373D] bg-[#1F2125] text-[#F5F3EE]", line: "border-[#2A2C31]", primary: "bg-prime-gold text-[#111]", todo: "border-[#4A4E56] text-[#B4B8BF]", bar: "bg-[#3A3D44]", sheetBg: "bg-[#1F2125] text-[#F5F3EE]" }
    : { sheet: "bg-white", text: "text-[#111]", sub: "text-[#5C6067]", eyebrow: "text-[#8A6A1F]", chip: "bg-[#FBF5E6] text-[#5E4812]", chip2: "bg-[#F3F1EC] text-[#3B3E44]", btn: "border-[#E5E0D4] bg-white text-[#111]", line: "border-[#EFEBE2]", primary: "bg-[#111] text-prime-gold", todo: "border-[#D5CFC0] text-[#6B6F76]", bar: "bg-[#E5E0D4]", sheetBg: "bg-white text-[#111]" };
  const mapPoint = target.lat != null && target.lng != null ? { lat: Number(target.lat), lng: Number(target.lng) } : null;

  return (
    <div className={`fixed inset-0 z-[60] flex flex-col ${night ? "bg-[#2A2D33]" : "bg-[#E8E4DA]"}`}>
      {/* Mapa */}
      <div className="absolute inset-x-0 top-0 h-[42dvh]" style={night ? { filter: "invert(0.92) hue-rotate(180deg) brightness(0.85) contrast(0.9)" } : undefined}>
        <MapSafe>
          <DriverHomeMap pickup={mapPoint} />
        </MapSafe>
      </div>

      {/* Cabeçalho flutuante */}
      <div className="relative z-10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-lg items-center justify-between rounded-full bg-[#111] py-2.5 pl-5 pr-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
          <p className="text-sm font-extrabold tracking-[0.12em]" style={{ color: "#fff" }}>
            PRIME <span className="text-prime-gold">VITÓRIA</span>
          </p>
          <span className="rounded-full bg-prime-gold px-3 py-1.5 text-xs font-bold text-[#111]">{s === "on_the_way" ? "A caminho" : s === "arrived" ? "No local" : "Em viagem"}</span>
        </div>
        {message ? <p className="mx-auto mt-2 max-w-lg rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow">{message}</p> : null}
      </div>

      {/* Cartão de baixo */}
      <section className={`absolute inset-x-0 bottom-0 top-[36dvh] z-10 flex flex-col rounded-t-[28px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] ${c.sheet}`}>
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-2.5">
          <div className="mx-auto max-w-lg">
            <div className={`mx-auto h-1.5 w-10 rounded-full ${c.bar}`} />

            <ol className="mt-4 flex items-center gap-2" aria-label="Paradas">
              {strip.map((st, i) => (
                <li key={st.key} className="flex flex-1 items-center gap-2 last:flex-none">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                      st.state === "done" ? "bg-[#111] text-prime-gold" : st.state === "now" ? "bg-prime-gold text-[#111] ring-4 ring-prime-gold/25" : `border-2 ${c.todo}`
                    }`}
                  >
                    {st.state === "done" ? "✓" : i === 0 ? "E" : i}
                  </span>
                  {i < strip.length - 1 ? <span className={`h-[3px] flex-1 rounded-full ${st.state === "done" ? "bg-[#8A6A1F]" : c.bar}`} /> : null}
                </li>
              ))}
            </ol>
            <div className={`mt-1 flex justify-between gap-2 text-[11px] font-semibold ${c.sub}`}>
              {strip.map((st) => (
                <span key={st.key} className={st.state === "now" ? c.text : ""}>
                  {st.label}
                </span>
              ))}
            </div>

            <p className={`mt-5 text-xs font-bold uppercase tracking-[0.1em] ${c.eyebrow}`}>{eyebrow}</p>
            <h1 className={`mt-1 text-[28px] font-extrabold leading-tight ${c.text}`}>{title}</h1>
            {subtitle ? <p className={`mt-1 text-[15px] ${c.sub}`}>{subtitle}</p> : null}

            {s === "arrived" ? <AutoWaitCard scheduledAt={trip.scheduled_at} now={now} night={night} /> : null}

            {s !== "arrived" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {s === "on_the_way" ? (
                  <span className={`rounded-xl px-3 py-2 text-sm font-bold ${until.tone === "late" ? "bg-red-600 text-[#fff]" : c.chip}`}>
                    {presentation ? "Chegar" : "Embarque"} às {hhmm(pickupAt)} · {until.text}
                  </span>
                ) : null}
                {traveling ? <span className={`rounded-xl px-3 py-2 text-sm font-bold ${c.chip}`}>{formatDriverGpsKm(gps.accumulatedKm)} km rodados</span> : null}
                {afterDrop ? <span className={`rounded-xl px-3 py-2 text-sm font-semibold ${c.chip2}`}>Depois: {first(afterDrop.passenger_name) || place(afterDrop.address_text)}</span> : null}
                {traveling && nextDrop?.final ? <span className={`rounded-xl px-3 py-2 text-sm font-semibold ${c.chip2}`}>Última parada</span> : null}
                {!traveling && trip.passenger_count ? <span className={`rounded-xl px-3 py-2 text-sm font-semibold ${c.chip2}`}>{trip.passenger_count} passageiro(s)</span> : null}
              </div>
            ) : null}

            {tooEarly ? <p className="mt-3 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">Ainda falta bastante ({until.text}). Saia com tempo de chegar uns 10 minutos antes de {hhmm(pickupAt)}.</p> : null}
            {gps.gpsError && traveling ? <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-2 text-xs text-amber-900">{gps.gpsError}</p> : null}
            {dropErr ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-800">{dropErr}</p> : null}

            {/* Botões */}
            <div className={`mt-4 grid gap-2.5 ${s === "arrived" ? "grid-cols-2" : "grid-cols-[2fr_1fr_1fr]"}`}>
              {s !== "arrived" ? (
                <button type="button" onClick={openNav} className={`flex h-14 items-center justify-center gap-2 rounded-2xl text-base font-bold ${c.primary}`}>
                  <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 11l18-8-8 18-2-8-8-2z" />
                  </svg>
                  Navegar
                </button>
              ) : null}
              <button
                type="button"
                disabled={!contactsNow.length}
                onClick={openCall}
                className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-[13px] font-semibold disabled:opacity-40 ${c.btn} ${s === "arrived" ? "flex-row gap-2 text-[15px]" : ""}`}
              >
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
                </svg>
                Ligar
              </button>
              <button
                type="button"
                disabled={!contactsNow.length}
                onClick={() => openMsg(s === "arrived" ? `Olá! Já estou no local de embarque (${place(trip.origin_text)}), aguardando você.` : undefined)}
                className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-[13px] font-semibold disabled:opacity-40 ${s === "arrived" ? "flex-row gap-2 border-transparent bg-[#E7F6EC] text-[15px] text-[#11461F]" : c.btn}`}
              >
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {s === "arrived" ? "Avisar que cheguei" : "Mensagem"}
              </button>
            </div>

            {!traveling && needsReceptiveSign({ service_extras: extras, origin_text: trip.origin_text }) ? (
              <div className="mt-3">
                <ReceptiveSignButton name={trip.passenger_name} />
              </div>
            ) : null}

            {multiPickup && !traveling ? (
              <div className="mt-4">
                <DriverPickupStopsPanel stops={pickups} isBusy={isBusy} onCompleteStop={(i) => onCompletePickupStop(trip.id, i)} />
              </div>
            ) : null}

            {/* Detalhes recolhidos */}
            <button type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} className={`mt-4 flex w-full items-center justify-between border-t py-3 text-sm font-semibold ${c.line} ${c.sub}`}>
              <span>Detalhes da corrida</span>
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: details ? "rotate(180deg)" : undefined }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {details ? (
              <div className="space-y-3 pb-2 text-[#111]">
                <div className="rounded-2xl bg-[#F8F7F3] p-4 text-sm">
                  <p className="font-semibold">{tripPeopleLabel(trip) || "Passageiro"}</p>
                  <p className="text-[#5C6067]">
                    {trip.passenger_count ? `${trip.passenger_count} pessoa(s)` : ""}
                    {trip.flight_number ? (
                      <>
                        {" · "}Voo{" "}
                        <a href={flightTrackerUrl(trip.flight_number)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#8A6A1F] underline">
                          {trip.flight_number}
                        </a>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-2 text-[#5C6067]">
                    Embarque: {trip.origin_text}
                    <br />
                    Destino: {trip.destination_text}
                  </p>
                  {extras.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {SERVICE_EXTRAS.filter((e) => extras.includes(e.id)).map((e) => (
                        <span key={e.id} className="rounded-full bg-[#F6EEDC] px-2.5 py-1 text-xs font-semibold">
                          {e.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {trip.notes ? <p className="mt-2 whitespace-pre-line rounded-xl bg-white px-3 py-2">{linkPhones(trip.notes)}</p> : null}
                </div>
                {drops.length ? (
                  <DriverDropoffStopsPanel tripId={trip.id} raw={trip.trip_dropoff_stops} active={traveling} devFallbackRole={devFallbackRole} onChanged={() => onTripChanged?.()} />
                ) : null}
                {s === "on_the_way" ? <DriverPassengerLink tripId={trip.id} status={s} devFallbackRole={devFallbackRole} /> : null}
                <DriverTripExpenses tripId={trip.id} devFallbackRole={devFallbackRole} />
                {others.length ? (
                  <div className="flex flex-wrap justify-center gap-3 pt-1">
                    {others.map((o) => (
                      <button
                        key={o}
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          if (!confirmDriverStatusTransition(o)) return;
                          onStatus(trip.id, o);
                        }}
                        className="text-sm text-red-700 underline"
                      >
                        {driverPrimaryActionLabel(s, o)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Barra de deslizar */}
        {next || dropMode ? (
          <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
            <div className="mx-auto max-w-lg">
              {blockStart ? <p className={`mb-2 text-center text-xs font-semibold ${night ? "text-amber-300" : "text-amber-800"}`}>Conclua todos os embarques antes de iniciar a viagem.</p> : null}
              <SwipeToConfirm
                key={`${s}-${dropIdx ?? "x"}`}
                label={swipeLabel}
                dark={night}
                busy={isBusy || dropBusy}
                disabled={!dropMode && blockStart}
                onConfirm={() => {
                  if (dropMode) void dropCurrent();
                  else if (next) onStatus(trip.id, next);
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {/* Escolha: Waze / Google / Apple, ou qual pessoa */}
      {sheet ? (
        <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/45" role="dialog" aria-modal="true" aria-label={sheet.title}>
          <button type="button" aria-label="Fechar" className="flex-1" onClick={() => setSheet(null)} />
          <div className={`rounded-t-[28px] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 ${c.sheetBg}`}>
            <div className="mx-auto max-w-lg">
              <p className="text-lg font-bold">{sheet.title}</p>
              <div className="mt-3 grid gap-2">
                {sheet.items.map((it) => (
                  <a
                    key={it.key}
                    href={it.href}
                    target={it.external ? "_blank" : undefined}
                    rel={it.external ? "noopener noreferrer" : undefined}
                    onClick={() => setSheet(null)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-base font-semibold ${c.btn}`}
                  >
                    <span>
                      {it.label}
                      {it.sub ? <span className={`block text-xs font-normal ${c.sub}`}>{it.sub}</span> : null}
                    </span>
                    <span aria-hidden>›</span>
                  </a>
                ))}
              </div>
              <button type="button" onClick={() => setSheet(null)} className={`mt-3 w-full py-3 text-sm font-semibold ${c.sub}`}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Espera automática: conta a partir do horário marcado; até 10 min é tolerância. */
function AutoWaitCard({ scheduledAt, now, night }: { scheduledAt: string; now: Date; night: boolean }) {
  const startMs = new Date(scheduledAt).getTime();
  const secs = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const over = secs > 600;
  const tolUntil = hhmm(new Date(startMs + 10 * 60000).toISOString());
  return (
    <div className={`mt-4 flex items-center gap-3.5 rounded-[20px] p-4 ${over ? "bg-amber-100" : night ? "bg-[#3B331C]" : "bg-[#FBF5E6]"}`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white">
        <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l3 2M9 2h6" />
        </svg>
      </span>
      <div className="flex-1">
        <p className={`text-[13px] font-semibold ${over ? "text-amber-900" : night ? "text-[#F3DFA2]" : "text-[#5E4812]"}`}>{over ? "Passou da tolerância — a central é avisada" : "Espera automática"}</p>
        <p className={`text-[28px] font-extrabold tabular-nums ${over ? "text-amber-900" : night ? "text-[#fff]" : "text-[#111]"}`}>{secs > 0 ? `${mm} min` : `começa ${hhmm(scheduledAt)}`}</p>
      </div>
      <span className={`text-right text-xs font-semibold leading-tight ${over ? "text-amber-900" : night ? "text-[#F3DFA2]" : "text-[#5E4812]"}`}>
        Tolerância
        <br />
        até {tolUntil}
      </span>
    </div>
  );
}
