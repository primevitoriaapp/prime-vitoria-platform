"use client";

import { useEffect, useState } from "react";

import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import { driverPrimaryActionLabel } from "@/lib/trips/driver-step-copy";
import { confirmDriverStatusTransition } from "@/lib/trips/driver-status-confirm";
import { buildGoogleMapsPointUrl, buildWazeNavigateUrl } from "@/lib/trips/driver-nav-links";
import { formatDriverGpsKm, type DriverTripGpsState } from "@/lib/trips/driver-complete-km";
import { SERVICE_EXTRAS, presentationAtIso } from "@/lib/trips/service-extras";
import { flightTrackerUrl } from "@/lib/trips/flight";
import { allPickupStopsCompleted, nextIncompletePickupStopIndex, parseTripPickupStops, pickupStopNavPoint } from "@/lib/trips/trip-pickup-stops";
import { DriverPickupStopsPanel } from "@/components/driver-pickup-stops-panel";
import { DriverDropoffStopsPanel } from "@/components/driver-dropoff-stops-panel";
import { DriverPassengerLink } from "@/components/driver-passenger-link";
import { linkPhones } from "@/lib/ui/link-phones";
import { tripContacts, tripPeopleLabel } from "@/lib/trips/trip-contacts";
import { DriverTripExpenses } from "@/components/trip-expenses";
import { ReceptiveSignButton, needsReceptiveSign } from "@/components/receptive-sign";

const TZ = "America/Sao_Paulo";

function dayKey(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: TZ });
}

/** "HOJE", "AMANHÃ" ou "sex, 07/11". */
function dayLabel(iso: string, now: Date) {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return "HOJE";
  if (dayKey(d) === dayKey(new Date(now.getTime() + 86400000))) return "AMANHÃ";
  return d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).toUpperCase();
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** "faltam 3h40", "faltam 25 min", "agora", "atrasado 12 min". */
function untilLabel(iso: string, now: Date): { text: string; tone: "far" | "soon" | "late" } {
  const min = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (min > 59) return { text: `faltam ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`, tone: "far" };
  if (min > 2) return { text: `faltam ${min} min`, tone: "soon" };
  if (min >= -2) return { text: "é agora", tone: "soon" };
  return { text: `atrasado ${-min} min`, tone: "late" };
}

const STEPS: { label: string; status: TripOperationalStatus }[] = [
  { label: "A caminho", status: "on_the_way" },
  { label: "Cheguei", status: "arrived" },
  { label: "Em viagem", status: "in_progress" },
  { label: "Concluir", status: "completed" }
];

function waPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
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

/**
 * Modo corrida: depois de "A caminho", a tela mostra só o que importa agora
 * (para onde ir, navegar, passageiro e o próximo botão).
 */
export function DriverTripFocus({ trip, isBusy, waitElapsedLabel, waitBusy, gps, devFallbackRole, onStatus, onWaitStart, onWaitStop, onCompletePickupStop, onTripChanged, message }: Props) {
  const s = trip.operational_status;
  const next = driverNextStatuses(s)[0];
  const others = driverNextStatuses(s).slice(1);
  const stepIdx = STEPS.findIndex((x) => x.status === s);
  const stops = parseTripPickupStops(trip.trip_pickup_stops);
  const multi = stops.length > 1;
  const stopIdx = multi ? nextIncompletePickupStopIndex(stops) : null;
  const pickupsDone = !multi || allPickupStopsCompleted(stops);
  const goingToDestination = s === "in_progress";
  const target = goingToDestination
    ? { lat: trip.destination_lat, lng: trip.destination_lng, label: trip.destination_text }
    : multi && stopIdx != null
      ? pickupStopNavPoint(stops[stopIdx])
      : { lat: trip.origin_lat, lng: trip.origin_lng, label: trip.origin_text };
  const targetText = String(target?.label ?? "—");
  const google = buildGoogleMapsPointUrl(target ?? {});
  const waze = buildWazeNavigateUrl(target ?? {});
  const presentation = presentationAtIso(trip.scheduled_at, (trip as { presentation_minutes?: number | null }).presentation_minutes);
  const extras = (trip as { service_extras?: string[] | null }).service_extras ?? [];
  const blockStart = next === "in_progress" && !pickupsDone;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const pickupAt = presentation ?? trip.scheduled_at;
  const until = untilLabel(pickupAt, now);
  const tooEarly = s === "on_the_way" && new Date(pickupAt).getTime() - now.getTime() > 90 * 60000;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#F1F0EC]">
      <header className="bg-[#111] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold tracking-[0.08em]" style={{ color: "#fff" }}>
              PRIME <span className="text-prime-gold">VITÓRIA</span>
            </p>
            <span className="rounded-full bg-prime-gold px-3 py-1 text-xs font-bold text-[#111]">
              {s === "on_the_way" ? "A caminho do embarque" : s === "arrived" ? "No local de embarque" : "Em viagem"}
            </span>
          </div>
          <ol className="mt-4 grid grid-cols-4" aria-label="Etapas">
            {STEPS.map((st, i) => (
              <li key={st.status} className="relative flex flex-col items-center">
                {i > 0 ? <span className={`absolute right-1/2 top-[7px] h-0.5 w-full ${i <= stepIdx ? "bg-prime-gold" : "bg-white/20"}`} /> : null}
                <span className={`relative z-10 h-4 w-4 rounded-full ${i <= stepIdx ? "bg-prime-gold" : "bg-white/25"}`} />
                <span className="mt-1 text-[11px]" style={{ color: i === stepIdx ? "#fff" : "rgba(255,255,255,0.55)" }}>
                  {st.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-40">
          {message ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p> : null}
          {!goingToDestination ? (
            <section
              className={`rounded-3xl p-5 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)] ${until.tone === "late" ? "bg-red-600" : "bg-[#111]"}`}
              aria-label="Horário do embarque"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: until.tone === "late" ? "#fff" : "#C9A84C" }}>
                {presentation ? "Estar no local" : "Horário do embarque"} · {dayLabel(pickupAt, now)}
              </p>
              <p className="mt-1 text-5xl font-bold tabular-nums" style={{ color: "#fff" }}>
                {hhmm(pickupAt)}
              </p>
              <p className="mt-1 text-base font-semibold" style={{ color: until.tone === "late" ? "#fff" : until.tone === "soon" ? "#C9A84C" : "rgba(255,255,255,0.75)" }}>
                {until.text}
              </p>
              {presentation ? (
                <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Passageiro marcado para {hhmm(trip.scheduled_at)}
                </p>
              ) : null}
            </section>
          ) : null}
          {tooEarly ? (
            <p className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">
              Ainda falta bastante para o embarque ({until.text}). Saia com tempo de chegar uns 10 minutos antes de {hhmm(pickupAt)}.
            </p>
          ) : null}
          {!goingToDestination && needsReceptiveSign({ service_extras: extras, origin_text: trip.origin_text }) ? (
            <ReceptiveSignButton name={trip.passenger_name} />
          ) : null}
          <section className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-prime-gold">
              {goingToDestination ? "Levar o passageiro para" : multi && stopIdx != null ? `Buscar na parada ${stopIdx + 1}` : "Buscar o passageiro em"}
            </p>
            <p className="mt-1 text-xl font-bold leading-snug text-[#111]">{targetText.split(",")[0]}</p>
            {targetText.includes(",") ? <p className="text-sm text-[#6B6F76]">{targetText.split(",").slice(1).join(",").trim()}</p> : null}
            {s !== "arrived" ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <a href={google} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E1D8] bg-[#F8F7F3] px-3 py-4 text-sm font-semibold text-[#111]">
                  <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z" fill="#1F7A4C" />
                    <circle cx="12" cy="9" r="2.6" fill="#fff" />
                  </svg>
                  Google Maps
                </a>
                {waze ? (
                  <a href={waze} className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E1D8] bg-[#F8F7F3] px-3 py-4 text-sm font-semibold text-[#111]">
                    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
                      <path d="M3 11.5 21 3l-8.5 18-2-7.5z" fill="#2B7FBF" />
                    </svg>
                    Waze
                  </a>
                ) : null}
              </div>
            ) : null}
          </section>

          {multi ? <DriverPickupStopsPanel stops={stops} isBusy={isBusy} onCompleteStop={(i) => onCompletePickupStop(trip.id, i)} /> : null}

          <DriverDropoffStopsPanel
            tripId={trip.id}
            raw={trip.trip_dropoff_stops}
            active={s === "in_progress"}
            devFallbackRole={devFallbackRole}
            onChanged={() => onTripChanged?.()}
          />

          {s === "arrived" ? (
            <section className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
              {trip.wait_started_at ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Aguardando o passageiro</p>
                  <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-[#111]">{waitElapsedLabel ?? "00:00"}</p>
                  <button type="button" disabled={waitBusy} onClick={() => onWaitStop(trip.id)} className="mt-3 w-full rounded-2xl border border-[#DDD5C2] px-4 py-3 text-sm font-semibold">
                    Passageiro chegou · parar contagem
                  </button>
                </>
              ) : (
                <button type="button" disabled={waitBusy} onClick={() => onWaitStart(trip.id)} className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  ⏱ Começar a contar espera
                </button>
              )}
              <p className="mt-2 text-xs text-[#6B6F76]">A espera fica registrada para a central cobrar hora parada, quando houver.</p>
            </section>
          ) : null}

          {s === "in_progress" ? (
            <section className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6F76]">Distância desta viagem (GPS)</p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#111]">
                {formatDriverGpsKm(gps.accumulatedKm)} <span className="text-lg font-medium">km</span>
              </p>
              {gps.gpsError ? <p className="mt-1 text-xs text-amber-800">{gps.gpsError}</p> : <p className="mt-1 text-xs text-[#6B6F76]">Mantenha o app aberto durante a viagem.</p>}
            </section>
          ) : null}

          <section className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6F76]">Passageiro</p>
            <p className="mt-1 text-lg font-semibold text-[#111]">{tripPeopleLabel(trip) || "Passageiro"}</p>
            <p className="text-sm text-[#6B6F76]">
              {trip.passenger_count ? `${trip.passenger_count} pessoa(s)` : ""}
              {trip.flight_number ? (
                <>
                  {" · "}Voo{" "}
                  <a href={flightTrackerUrl(trip.flight_number)} target="_blank" rel="noopener noreferrer" className="font-semibold text-prime-gold">
                    {trip.flight_number}
                  </a>
                </>
              ) : null}
            </p>
            {extras.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SERVICE_EXTRAS.filter((e) => extras.includes(e.id)).map((e) => (
                  <span key={e.id} className="rounded-full bg-[#F6EEDC] px-2.5 py-1 text-xs font-semibold text-[#111]">
                    {e.label}
                  </span>
                ))}
              </div>
            ) : null}
            {trip.notes ? <p className="mt-2 rounded-xl bg-[#F8F7F3] px-3 py-2 text-sm text-[#333]">{linkPhones(trip.notes)}</p> : null}
            {tripContacts(trip)
              .filter((c) => c.phone)
              .map((c) => (
                <div key={`${c.role}-${c.name}`} className="mt-3">
                  {tripContacts(trip).length > 1 ? (
                    <p className="mb-1 text-sm font-semibold text-[#111]">
                      {c.name} <span className="text-xs font-normal text-[#6B6F76]">· {c.role}</span>
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <a href={`tel:${c.phone}`} className="rounded-2xl border border-[#E5E1D8] px-3 py-3 text-center text-sm font-semibold text-[#111]">
                      📞 Ligar
                    </a>
                    <a href={`https://wa.me/${waPhone(String(c.phone))}`} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-[#CFE9D9] bg-[#EFFBF3] px-3 py-3 text-center text-sm font-semibold text-[#111]">
                      💬 WhatsApp
                    </a>
                  </div>
                </div>
              ))}
          </section>

          {s === "on_the_way" ? <DriverPassengerLink tripId={trip.id} status={s} devFallbackRole={devFallbackRole} /> : null}
          <DriverTripExpenses tripId={trip.id} devFallbackRole={devFallbackRole} />

          {others.length ? (
            <div className="flex flex-wrap justify-center gap-3">
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
      </main>

      {next ? (
        <div className="fixed inset-x-0 bottom-0 z-[61] border-t border-[#E7E2D7] bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-lg">
            {blockStart ? <p className="mb-2 text-center text-xs text-amber-800">Conclua todos os embarques antes de iniciar a viagem.</p> : null}
            <button
              type="button"
              disabled={isBusy || blockStart}
              onClick={() => {
                if (!confirmDriverStatusTransition(next)) return;
                onStatus(trip.id, next);
              }}
              className="min-h-[3.75rem] w-full rounded-2xl bg-[#111] px-4 py-4 text-lg font-bold text-prime-gold shadow-lg disabled:opacity-60"
            >
              {isBusy ? "Processando…" : next === "arrived" ? "Cheguei ao local" : next === "in_progress" ? "Passageiro embarcou · Iniciar viagem" : next === "completed" ? "Cheguei ao destino · Finalizar" : driverPrimaryActionLabel(s, next)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
