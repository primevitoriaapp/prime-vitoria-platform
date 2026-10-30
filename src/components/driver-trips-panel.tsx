"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { clearDriverTabAlertBadge, notifyDriverNewAssignment } from "@/lib/client/driver-alert-notify";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { StatusBadge } from "@/components/status-badge";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { pickDriverFocusTripId } from "@/lib/trips/driver-step-copy";
import { DriverTripSkeleton } from "@/components/driver-trip-skeleton";
import { DriverActiveTripHero } from "@/components/driver-active-trip-hero";
import { DriverNewTripBanner } from "@/components/driver-new-trip-banner";
import { useDriverPushRefresh } from "@/hooks/use-driver-push-refresh";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { useDriverTripGpsTracking } from "@/hooks/use-driver-trip-gps-tracking";
import { parseDriverKmInput } from "@/lib/trips/driver-complete-km";
import { DriverFinishSheet } from "@/components/driver-finish-sheet";
import { DriverPassengerLink } from "@/components/driver-passenger-link";
import { DriverTripExpenses } from "@/components/trip-expenses";

const ACTIVE: TripOperationalStatus[] = [
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress"
];

const HISTORY: TripOperationalStatus[] = ["completed", "cancelled", "no_show", "rejected"];

const FOCUS_EVENT = "pv-driver-focus-trip";
const ALERT_STATUSES: TripOperationalStatus[] = ["dispatched", "accepted", "approved"];

type Props = {
  tenantId?: string | null;
  driverIdFilter?: string | null;
  devFallbackRole?: "motorista" | "admin";
  /** Qual aba do app está aberta: início (próxima corrida), agenda (próximas) ou corridas (histórico). */
  view?: "inicio" | "agenda" | "historico";
  onSeeAll?: () => void;
  /** Mantém a lógica (avisos, GPS) rodando mesmo com outra aba aberta. */
  hidden?: boolean;
};

export function DriverTripsPanel({
  tenantId = null,
  driverIdFilter = null,
  devFallbackRole = "motorista",
  view = "inicio",
  onSeeAll,
  hidden = false
}: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [highlightTripId, setHighlightTripId] = useState<string | null>(null);
  const [newTripBanner, setNewTripBanner] = useState<{ origin: string; destination: string } | null>(null);
  const [waitBusy, setWaitBusy] = useState(false);
  const [waitTick, setWaitTick] = useState(0);
  const [completeKmByTrip, setCompleteKmByTrip] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ tripId: string; mode: "start" | "finish" } | null>(null);
  const docVisible = useDocumentVisible();
  const knownTripIdsRef = useRef<Set<string>>(new Set());
  const tripsInitializedRef = useRef(false);

  const { getTripGpsState, resolveActualKmForComplete, clearTripTrail } = useDriverTripGpsTracking({
    trips,
    devFallbackRole
  });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const params = new URLSearchParams({ page: "1", pageSize: "30" });
    if (driverIdFilter) params.set("driverId", driverIdFilter);
    const res = await fetchWithSupabaseSession(`/api/trips?${params}`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: { items: Trip[] }; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setTrips([]);
      setMessage(json.error?.message ?? "Não foi possível carregar corridas.");
      setLoading(false);
      return;
    }
    const items = json.data?.items ?? [];
    const newAssignments = items.filter(
      (t) => !knownTripIdsRef.current.has(t.id) && ALERT_STATUSES.includes(t.operational_status)
    );
    if (tripsInitializedRef.current && newAssignments.length > 0) {
      const first = newAssignments[0]!;
      setNewTripBanner({
        origin: first.origin_text?.trim() || "Origem",
        destination: first.destination_text?.trim() || "Destino"
      });
      notifyDriverNewAssignment("trip");
    }
    knownTripIdsRef.current = new Set(items.map((t) => t.id));
    tripsInitializedRef.current = true;
    setTrips(items);
    setMessage(null);
    setLoading(false);
  }, [devFallbackRole, driverIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () =>
      trips
        .filter((t) => ACTIVE.includes(t.operational_status))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [trips]
  );
  const primaryId = useMemo(() => pickDriverFocusTripId(active), [active]);
  const primaryTrip = active.find((t) => t.id === primaryId) ?? null;
  const otherActive = active.filter((t) => t.id !== primaryId);

  useEffect(() => {
    if (docVisible) clearDriverTabAlertBadge();
  }, [docVisible]);

  const waitingTrip = active.find((trip) => trip.wait_started_at) ?? null;
  useEffect(() => {
    if (!waitingTrip?.wait_started_at) return;
    const timer = setInterval(() => setWaitTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [waitingTrip?.id, waitingTrip?.wait_started_at]);

  const waitElapsedLabel = useMemo(() => {
    void waitTick;
    const started = waitingTrip?.wait_started_at;
    if (!started) return null;
    const ms = Math.max(0, Date.now() - new Date(started).getTime());
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [waitingTrip?.wait_started_at, waitTick]);



  useEffect(() => {
    if (!docVisible) return;
    const timer = setInterval(() => void load({ silent: true }), 15_000);
    return () => clearInterval(timer);
  }, [load, docVisible]);

  useTenantTableRefresh(tenantId, ["trips", "dispatch_offers"], () => void load({ silent: active.length > 0 }));

  useDriverPushRefresh(
    () => void load({ silent: trips.length > 0 }),
    () => {
      notifyDriverNewAssignment("trip");
      void load({ silent: true });
    }
  );

  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ tripId: string }>).detail?.tripId;
      if (id) {
        setHighlightTripId(id);
        void load({ silent: trips.length > 0 });
      }
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, [load, trips.length]);

  async function setWait(tripId: string, action: "start" | "stop") {
    setWaitBusy(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/wait`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setWaitBusy(false);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao cadastrar espera.");
      return;
    }
    if (action === "stop") {
      setMessage("Tempo de espera cadastrado.");
    }
    await load({ silent: true });
  }

  async function setStatus(
    tripId: string,
    to_status: TripOperationalStatus,
    extra?: { odometer_start?: string; odometer_end?: string }
  ) {
    const trip = trips.find((item) => item.id === tripId);
    // KM do painel: pede o inicial ao iniciar e o final (com assinatura) ao finalizar.
    if (to_status === "in_progress" && !extra) {
      setMessage(null);
      setSheet({ tripId, mode: "start" });
      return;
    }
    if (to_status === "completed" && !extra && trip?.odometer_start != null) {
      setMessage(null);
      setSheet({ tripId, mode: "finish" });
      return;
    }
    if (to_status === "in_progress" && trip?.wait_started_at) {
      await setWait(tripId, "stop");
    }
    let actualKm: number | undefined;
    let kmFromGps = false;
    if (to_status === "completed" && extra?.odometer_end) {
      // Distância cobrada = GPS; se o GPS falhou, o servidor usa a diferença do painel.
      const gps = getTripGpsState(tripId);
      if (!gps.requiresManualKm && gps.accumulatedKm != null && gps.accumulatedKm > 0) {
        actualKm = gps.accumulatedKm;
        kmFromGps = true;
      }
    } else if (to_status === "completed") {
      const manualKm = parseDriverKmInput(completeKmByTrip[tripId] ?? "");
      const resolved = resolveActualKmForComplete(tripId, manualKm);
      if (resolved == null) {
        setMessage("Informe o KM percorrido para finalizar");
        return;
      }
      actualKm = resolved;
    }
    setBusyTrip(tripId);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_status,
          ...(actualKm != null ? { actual_km: actualKm, km_from_gps: kmFromGps } : {}),
          ...(extra ?? {})
        })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusyTrip(null);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao atualizar estado.");
      return;
    }
    setSheet(null);
    if (to_status === "completed") {
      clearTripTrail(tripId);
      setCompleteKmByTrip((prev) => {
        const next = { ...prev };
        delete next[tripId];
        return next;
      });
    }
    setMessage(`Estado: ${STATUS_CORRIDA_PT[to_status]}.`);
    await load();
  }

  async function completePickupStop(tripId: string, stopIndex: number) {
    setBusyTrip(tripId);
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/pickup-stop-complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stop_index: stopIndex })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setBusyTrip(null);
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao concluir parada.");
      return;
    }
    setMessage(`Parada ${stopIndex + 1} concluída.`);
    await load({ silent: true });
  }

  async function sendGps(trip: Trip) {
    if (!navigator.geolocation) {
      setMessage("GPS indisponível neste dispositivo.");
      return;
    }
    setBusyTrip(trip.id);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await fetchWithSupabaseSession(
          "/api/drivers/location",
          {
            method: "POST",
            body: JSON.stringify({
              trip_id: trip.id,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              recorded_at: new Date().toISOString()
            })
          },
          devFallbackRole
        );
        const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
        setBusyTrip(null);
        setMessage(
          res.ok && json.success ? "Localização enviada (trail KM)." : (json.error?.message ?? "Falha ao enviar GPS.")
        );
      },
      () => {
        setBusyTrip(null);
        setMessage("Permissão de localização negada.");
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }

  const recentHistory = trips
    .filter((t) => HISTORY.includes(t.operational_status))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 30);

  const card = "rounded-3xl border border-[#ECE7DB] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.05)]";
  const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  const short = (a?: string | null) => String(a ?? "—").split(",")[0];

  return (
    <div className={hidden ? "hidden" : "space-y-5"}>
      {newTripBanner ? (
        <DriverNewTripBanner
          origin={newTripBanner.origin}
          destination={newTripBanner.destination}
          onDismiss={() => setNewTripBanner(null)}
        />
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {loading ? "Carregando corridas…" : message ?? (active.length ? `${active.length} corridas ativas` : "Sem corridas ativas")}
      </p>
      {message && !sheet ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p> : null}

      {view === "inicio" ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between px-1">
            <h2 className="text-lg font-semibold text-[#111]">Próxima corrida</h2>
            {primaryTrip ? (
              <span className="text-sm text-[#8A8A8A]">
                {groupByDay([primaryTrip])[0]?.label} · {hm(primaryTrip.scheduled_at)}
              </span>
            ) : null}
          </div>
          {loading ? (
            <DriverTripSkeleton />
          ) : !primaryTrip ? (
            <div className={`${card} text-center`}>
              <p className="text-3xl">🚘</p>
              <p className="mt-2 font-semibold text-[#111]">Nenhuma corrida agendada</p>
              <p className="mt-1 text-sm text-[#8A8A8A]">Quando a central te passar uma corrida, ela aparece aqui e o celular avisa.</p>
            </div>
          ) : (
            <>
              <DriverActiveTripHero
                trip={primaryTrip}
                isBusy={busyTrip === primaryTrip.id}
                highlighted={highlightTripId === primaryTrip.id}
                waitElapsedLabel={primaryTrip.wait_started_at ? waitElapsedLabel : null}
                waitBusy={waitBusy}
                completeKm={completeKmByTrip[primaryTrip.id] ?? ""}
                gpsTracking={getTripGpsState(primaryTrip.id)}
                onCompleteKmChange={(id, value) => setCompleteKmByTrip((prev) => ({ ...prev, [id]: value }))}
                onStatus={setStatus}
                onCompletePickupStop={(id, idx) => void completePickupStop(id, idx)}
                onGps={sendGps}
                onWaitStart={(id) => void setWait(id, "start")}
                onWaitStop={(id) => void setWait(id, "stop")}
              />
              <DriverPassengerLink tripId={primaryTrip.id} status={primaryTrip.operational_status} devFallbackRole={devFallbackRole} />
              {["on_the_way", "arrived", "in_progress"].includes(primaryTrip.operational_status) ? (
                <DriverTripExpenses tripId={primaryTrip.id} devFallbackRole={devFallbackRole} />
              ) : null}
            </>
          )}

          {otherActive.length > 0 ? (
            <div className={card}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#111]">Mais agendamentos</h3>
                {onSeeAll ? (
                  <button type="button" onClick={onSeeAll} className="text-sm text-[#8A8A8A]">
                    Ver todos
                  </button>
                ) : null}
              </div>
              <ul className="mt-3 divide-y divide-[#F0ECE3]">
                {otherActive.slice(0, 4).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="shrink-0 font-semibold text-[#111]">
                      {groupByDay([t])[0]?.label === "Hoje" ? "" : `${groupByDay([t])[0]?.label} · `}
                      {hm(t.scheduled_at)}
                    </span>
                    <span className="min-w-0 truncate text-right text-[#8A8A8A]">
                      {short(t.origin_text)} → {short(t.destination_text)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "agenda" ? (
        <section className="space-y-3">
          <h2 className="px-1 text-lg font-semibold text-[#111]">Minha agenda</h2>
          {loading ? (
            <DriverTripSkeleton />
          ) : active.length === 0 ? (
            <div className={`${card} text-center text-sm text-[#8A8A8A]`}>Nenhuma corrida agendada para você.</div>
          ) : (
            groupByDay(active).map((g) => (
              <div key={g.key} className={card}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-prime-gold">{g.label}</p>
                <ul className="divide-y divide-[#F0ECE3]">
                  {g.trips.map((t) => (
                    <li key={t.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-lg font-bold text-[#111]">{hm(t.scheduled_at)}</span>
                        <StatusBadge status={t.operational_status} />
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-[#111]">{t.passenger_name?.trim() || "Passageiro"}</p>
                      <p className="text-sm text-[#8A8A8A]">
                        {short(t.origin_text)} → {short(t.destination_text)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      ) : null}

      {sheet && trips.find((t) => t.id === sheet.tripId) ? (
        <DriverFinishSheet
          trip={trips.find((t) => t.id === sheet.tripId) as Trip}
          mode={sheet.mode}
          devFallbackRole={devFallbackRole}
          busy={busyTrip === sheet.tripId}
          externalError={message}
          onCancel={() => {
            setSheet(null);
            setMessage(null);
          }}
          onConfirm={(extra) => void setStatus(sheet.tripId, sheet.mode === "start" ? "in_progress" : "completed", extra)}
        />
      ) : null}

      {view === "historico" ? (
        <section className="space-y-3">
          <h2 className="px-1 text-lg font-semibold text-[#111]">Corridas realizadas</h2>
          {recentHistory.length === 0 ? (
            <div className={`${card} text-center text-sm text-[#8A8A8A]`}>Nenhuma corrida finalizada ainda.</div>
          ) : (
            <ul className={`${card} divide-y divide-[#F0ECE3] !py-2`}>
              {recentHistory.map((trip) => (
                <li key={trip.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#111]">{formatBrDateTime(trip.scheduled_at)}</span>
                    <StatusBadge status={trip.operational_status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-[#8A8A8A]">
                    {short(trip.origin_text)} → {short(trip.destination_text)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Agrupa as corridas por dia: Hoje, Amanhã, depois o dia da semana. */
function groupByDay(list: Trip[]): { key: string; label: string; trips: Trip[] }[] {
  const ymd = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const today = ymd(new Date().toISOString());
  const tomorrow = ymd(new Date(Date.now() + 86400000).toISOString());
  const out: { key: string; label: string; trips: Trip[] }[] = [];
  for (const t of list) {
    const k = t.scheduled_at ? ymd(t.scheduled_at) : "sem-data";
    let g = out.find((x) => x.key === k);
    if (!g) {
      const label =
        k === "sem-data"
          ? "Sem data"
          : k < today
            ? "Atrasadas (já passou o horário)"
            : k === today
              ? "Hoje"
              : k === tomorrow
                ? "Amanhã"
                : new Date(`${k}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" });
      g = { key: k, label, trips: [] };
      out.push(g);
    }
    g.trips.push(t);
  }
  return out;
}
