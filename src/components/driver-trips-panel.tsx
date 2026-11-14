"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearDriverTabAlertBadge, notifyDriverNewAssignment } from "@/lib/client/driver-alert-notify";
import { installSoundUnlock, playError, playSuccess } from "@/lib/client/sounds";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import { StatusBadge } from "@/components/status-badge";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { pickDriverFocusTripId } from "@/lib/trips/driver-step-copy";
import { DriverTripSkeleton } from "@/components/driver-trip-skeleton";
import { DriverActiveTripHero } from "@/components/driver-active-trip-hero";
import { DriverPassengerContact } from "@/components/driver-passenger-contact";
import { tripPeopleLabel } from "@/lib/trips/trip-contacts";
import { DriverDeclineButton } from "@/components/driver-decline-sheet";
import { SwipeToConfirm } from "@/components/swipe-to-confirm";
import { DriverNewTripBanner } from "@/components/driver-new-trip-banner";
import { useDriverPushRefresh } from "@/hooks/use-driver-push-refresh";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { useDriverTripGpsTracking } from "@/hooks/use-driver-trip-gps-tracking";
import { parseDriverKmInput } from "@/lib/trips/driver-complete-km";
import { DriverFinishSheet } from "@/components/driver-finish-sheet";
import { DriverTripFocus } from "@/components/driver-trip-focus";
import { DriverPassengerLink } from "@/components/driver-passenger-link";
import { DriverTripExpenses } from "@/components/trip-expenses";
import { fmtRating, tripTags, type DriverSummary } from "@/components/driver-app-home";
import type { ReactNode } from "react";

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

type StatusExtra = { odometer_start?: string; odometer_end?: string; force_review?: boolean; review_reason?: string };

/** Posição atual do celular (alta precisão). Null se o GPS não responder. */
function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 }
    );
  });
}

type Props = {
  tenantId?: string | null;
  driverIdFilter?: string | null;
  devFallbackRole?: "motorista" | "admin";
  /** Qual aba do app está aberta: início (próxima corrida), agenda (próximas) ou corridas (histórico). */
  view?: "inicio" | "agenda" | "historico";
  onSeeAll?: () => void;
  /** Mantém a lógica (avisos, GPS) rodando mesmo com outra aba aberta. */
  hidden?: boolean;
  /** Abre a aba Início (card flutuante de corrida agendada). */
  onGoHome?: () => void;
  /** Avisa qual é a próxima corrida (para o mapa do início). */
  onPrimaryTrip?: (trip: Trip | null) => void;
  /** Resumo do motorista (histórico do mês e notas). */
  summary?: DriverSummary | null;
  /** Início sem corrida (disponível, resumo, atalhos). */
  idleHome?: ReactNode;
};

export function DriverTripsPanel({
  tenantId = null,
  driverIdFilter = null,
  devFallbackRole = "motorista",
  view = "inicio",
  onSeeAll,
  hidden = false,
  onGoHome,
  onPrimaryTrip,
  summary = null,
  idleHome
}: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [, setHighlightTripId] = useState<string | null>(null);
  const [newTripBanner, setNewTripBanner] = useState<{ origin: string; destination: string } | null>(null);
  const [waitBusy, setWaitBusy] = useState(false);
  const [waitTick, setWaitTick] = useState(0);
  const [completeKmByTrip, setCompleteKmByTrip] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ tripId: string; mode: "start" | "finish" } | null>(null);
  const [geoBlock, setGeoBlock] = useState<{ tripId: string; to_status: TripOperationalStatus; extra?: StatusExtra; message: string } | null>(null);
  const [geoReason, setGeoReason] = useState("");
  const [floatDismissed, setFloatDismissed] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [agendaFilter, setAgendaFilter] = useState<"hoje" | "amanha" | "semana">("semana");
  const [histMonth, setHistMonth] = useState<string>(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7));
  const [payByTrip, setPayByTrip] = useState<Record<string, { stage: string; amount: number; paid_at: string | null }>>({});
  useEffect(() => installSoundUnlock(), []);

  useEffect(() => {
    if (view !== "historico" || devFallbackRole !== "motorista") return;
    void fetch("/api/drivers/me/wallet", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: { items?: { trip_id: string | null; stage: string; amount: number; paid_at: string | null }[] } }) => {
        const m: Record<string, { stage: string; amount: number; paid_at: string | null }> = {};
        for (const i of j.data?.items ?? []) if (i.trip_id) m[i.trip_id] = { stage: i.stage, amount: i.amount, paid_at: i.paid_at };
        setPayByTrip(m);
      })
      .catch(() => undefined);
  }, [view, devFallbackRole]);
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
  const primaryKey = primaryTrip ? `${primaryTrip.id}:${primaryTrip.operational_status}` : "";
  useEffect(() => {
    onPrimaryTrip?.(primaryTrip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKey]);

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
    extra?: StatusExtra
  ) {
    const trip = trips.find((item) => item.id === tripId);
    // "A caminho" avisa o passageiro. Se ainda falta muito, confirma antes.
    if (to_status === "on_the_way" && trip && typeof window !== "undefined") {
      const min = Math.round((new Date(trip.scheduled_at).getTime() - Date.now()) / 60000);
      if (min > 90) {
        const hora = new Date(trip.scheduled_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
        const falta = `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
        if (!window.confirm(`O embarque é às ${hora} (faltam ${falta}).\n\n"A caminho" avisa o passageiro que você já saiu. Você está mesmo saindo agora?`)) return;
      }
    }
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
      if (resolved == null && !extra?.force_review) {
        setGeoReason("");
        setGeoBlock({ tripId, to_status, extra, message: "Não consegui medir o KM desta corrida (GPS ou KM do painel)." });
        return;
      }
      if (resolved != null) actualKm = resolved;
    }
    setBusyTrip(tripId);
    setMessage(null);
    const needsPlace = ["arrived", "in_progress", "completed"].includes(to_status);
    const position = needsPlace ? await currentPosition() : null;
    let res: Response;
    try {
      res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_status,
          ...(actualKm != null ? { actual_km: actualKm, km_from_gps: kmFromGps } : {}),
          ...(extra ?? {}),
          ...(needsPlace ? { position } : {})
        })
      },
      devFallbackRole
    );
    } catch {
      setBusyTrip(null);
      playError();
      setMessage("Sem internet agora. Confira o sinal e toque de novo — nada foi perdido.");
      return;
    }
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { code?: string; message?: string } };
    setBusyTrip(null);
    if (!res.ok || !json.success) {
      const fixable = ["GEOFENCE", "ACTUAL_KM_REQUIRED", "SIGNATURE_REQUIRED", "ODOMETER_INVALID", "ODOMETER_START_REQUIRED"];
      if (fixable.includes(json.error?.code ?? "") || (to_status === "completed" && res.status >= 500)) {
        playError();
        setGeoReason("");
        setGeoBlock({ tripId, to_status, extra, message: json.error?.message ?? "Não foi possível concluir esta etapa." });
        return;
      }
      playError();
      setMessage(json.error?.message ?? "Falha ao atualizar estado.");
      return;
    }
    playSuccess();
    setGeoBlock(null);
    setSheet(null);
    if (to_status === "completed") {
      clearTripTrail(tripId);
      setCompleteKmByTrip((prev) => {
        const next = { ...prev };
        delete next[tripId];
        return next;
      });
    }
    setMessage(
      extra?.force_review ? `${STATUS_CORRIDA_PT[to_status]} · enviada para a central revisar.` : `Estado: ${STATUS_CORRIDA_PT[to_status]}.`
    );
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
    playSuccess();
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
    .slice(0, 200);

  const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  const short = (a?: string | null) => String(a ?? "—").split(",")[0];

  const floatTrip =
    primaryTrip && ["dispatched", "accepted", "approved"].includes(primaryTrip.operational_status) ? primaryTrip : null;
  const floatSoon = floatTrip ? new Date(floatTrip.scheduled_at).getTime() - Date.now() < 3 * 3600_000 : false;

  function openFloatTrip() {
    if (!floatTrip) return;
    onGoHome?.();
    setFloatDismissed(true);
    setHighlightTripId(floatTrip.id);
    window.setTimeout(() => {
      document.querySelector(`[data-driver-trip-id="${floatTrip.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }

  return (
    <>
    {floatTrip && !floatDismissed && !sheet && !geoBlock && view !== "inicio" ? (
      <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 px-4 pv-float-in">
        <div className="mx-auto flex max-w-lg items-center gap-3 rounded-[28px] border border-[#ECE7DB] bg-white/95 p-3 pl-4 shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur">
          <button type="button" onClick={openFloatTrip} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#111] text-lg" aria-hidden>
              🚘
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[#111]">Você tem uma corrida agendada</span>
              <span className="block truncate text-xs text-[#6B6F76]">
                {groupByDay([floatTrip])[0]?.label} · {hm(floatTrip.scheduled_at)} · {short(floatTrip.origin_text)}
              </span>
            </span>
          </button>
          {floatSoon ? (
            <button
              type="button"
              disabled={busyTrip === floatTrip.id}
              onClick={() => {
                openFloatTrip();
                void setStatus(floatTrip.id, "on_the_way");
              }}
              className="shrink-0 rounded-full bg-[#111] px-4 py-2.5 text-xs font-semibold text-prime-gold disabled:opacity-60"
            >
              A caminho
            </button>
          ) : (
            <button type="button" onClick={openFloatTrip} className="shrink-0 rounded-full bg-[#F4F1EA] px-4 py-2.5 text-xs font-semibold text-[#111]">
              Ver
            </button>
          )}
          <button type="button" aria-label="Fechar" onClick={() => setFloatDismissed(true)} className="shrink-0 px-1 text-lg text-[#B5B0A5]">
            ×
          </button>
        </div>
      </div>
    ) : null}

    {geoBlock ? (
      <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true">
        <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-[28px] bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FBF3E0] text-2xl" aria-hidden>
            📍
          </div>
          <h3 className="mt-3 text-lg font-semibold text-[#111]">
            {geoBlock.to_status === "completed" ? "Aconteceu algum problema para finalizar?" : "Aconteceu algum problema?"}
          </h3>
          <p className="mt-1 text-sm text-[#555]">{geoBlock.message}</p>
          <p className="mt-3 text-xs font-semibold text-[#111]">O que aconteceu?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(geoBlock.to_status === "completed"
              ? ["Já deixei o passageiro no destino", "GPS sem sinal / não marcou", "Passageiro desceu em outro lugar", "Passageiro não quis assinar"]
              : ["Já estou no local", "GPS sem sinal / não marcou", "Embarque em outro ponto"]
            ).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setGeoReason(r)}
                className={`rounded-full px-3 py-1.5 text-xs ring-1 ${geoReason === r ? "bg-[#111] text-prime-gold ring-[#111]" : "text-[#333] ring-[#E7E2D7]"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={geoReason}
            onChange={(e) => setGeoReason(e.target.value)}
            rows={2}
            placeholder="Ou escreva com suas palavras"
            className="mt-2 w-full rounded-xl border border-[#E7E2D7] px-3 py-2 text-base text-[#111]"
          />
          <button
            type="button"
            disabled={geoReason.trim().length < 3 || busyTrip === geoBlock.tripId}
            onClick={() => {
              const g = geoBlock;
              void setStatus(g.tripId, g.to_status, { ...(g.extra ?? {}), force_review: true, review_reason: geoReason.trim() });
            }}
            className="mt-3 w-full rounded-2xl bg-[#111] py-3.5 text-sm font-semibold text-prime-gold disabled:opacity-40"
          >
            {geoBlock.to_status === "completed" ? "Finalizar mesmo assim e avisar a central" : "Continuar e avisar a central"}
          </button>
          <button
            type="button"
            onClick={() => {
              const g = geoBlock;
              setGeoBlock(null);
              void setStatus(g.tripId, g.to_status, g.extra);
            }}
            className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-[#111] ring-1 ring-[#E7E2D7]"
          >
            Tentar de novo
          </button>
          <button type="button" onClick={() => setGeoBlock(null)} className="mt-3 w-full py-2 text-sm text-[#6B6F76]">
            Voltar
          </button>
        </div>
      </div>
    ) : null}

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
      {message && !sheet && view !== "inicio" ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p> : null}

      {primaryTrip && ["on_the_way", "arrived", "in_progress"].includes(primaryTrip.operational_status) && !hidden ? (
        <DriverTripFocus
          trip={primaryTrip}
          isBusy={busyTrip === primaryTrip.id}
          waitElapsedLabel={primaryTrip.wait_started_at ? waitElapsedLabel : null}
          waitBusy={waitBusy}
          gps={getTripGpsState(primaryTrip.id)}
          devFallbackRole={devFallbackRole}
          onStatus={setStatus}
          onWaitStart={(id) => void setWait(id, "start")}
          onWaitStop={(id) => void setWait(id, "stop")}
          onCompletePickupStop={(id, idx) => void completePickupStop(id, idx)}
          onTripChanged={() => void load({ silent: true })}
          message={sheet ? null : message}
        />
      ) : null}

      {view === "inicio" && !hidden ? (
        <>
          {/* Pop-up da corrida em cima do mapa */}
          <div className={`fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 ${!loading && !primaryTrip && idleHome ? "" : "px-3 pb-3"}`}>
            <div className="mx-auto max-w-lg">
              {message && !sheet ? <p className="mb-2 rounded-2xl bg-white/95 px-4 py-3 text-sm text-[#8A5A00] shadow">{message}</p> : null}
              {loading ? (
                <div className="h-24 animate-pulse rounded-[28px] bg-white/90 shadow" />
              ) : !primaryTrip ? (
                idleHome ?? null
              ) : (
                <div className={`rounded-[28px] bg-white px-5 pb-4 pt-2.5 ${["dispatched", "accepted", "approved", "reassigned"].includes(primaryTrip.operational_status) ? "pv-glow" : "shadow-[0_18px_40px_rgba(0,0,0,0.18)]"}`}>
                  <div className="mx-auto h-1.5 w-10 rounded-full bg-[#DDD8CC]" />
                  <button type="button" onClick={() => setDetailOpen(true)} className="mt-3 block w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#8A6A1F]">
                          {primaryTrip.operational_status === "dispatched" ? "Nova corrida para você" : ["accepted", "approved", "reassigned"].includes(primaryTrip.operational_status) ? "Próxima corrida · confirmada" : "Corrida em andamento"} · {groupByDay([primaryTrip])[0]?.label}
                        </p>
                        <p className="mt-0.5 text-[30px] font-extrabold leading-none tabular-nums text-[#111]">{hm(primaryTrip.scheduled_at)}</p>
                      </div>
                      <span className="mt-1 shrink-0 rounded-full bg-[#F3F1EC] px-3 py-1.5 text-xs font-semibold text-[#3B3E44]">Detalhes ›</span>
                    </div>
                    <p className="mt-2 truncate text-lg font-bold text-[#111]">{tripPeopleLabel(primaryTrip) || "Passageiro"}</p>
                    <div className="mt-2 grid grid-cols-[14px_1fr] gap-x-2.5 gap-y-1.5 text-sm">
                      <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#111]" aria-hidden />
                      <span className="truncate text-[#333]">{short(primaryTrip.origin_text)}</span>
                      <span className="mt-1.5 h-2.5 w-2.5 rounded-sm bg-prime-gold" aria-hidden />
                      <span className="truncate text-[#5C6067]">{short(primaryTrip.destination_text)}</span>
                    </div>
                    <DriverPayLine trip={primaryTrip} />
                  </button>
                  {primaryTrip.operational_status === "dispatched" ? (
                    <>
                      <div className="mt-3">
                        <SwipeToConfirm label="Deslize para confirmar" busy={busyTrip === primaryTrip.id} onConfirm={() => void setStatus(primaryTrip.id, "accepted")} />
                      </div>
                      <p className="mt-1.5 text-center text-xs text-[#5C6067]">Confirmar não avisa o passageiro.</p>
                      <DriverDeclineButton tripId={primaryTrip.id} devFallbackRole={devFallbackRole} onDeclined={() => { setMessage("Corrida devolvida para a central."); void load(); }} />
                    </>
                  ) : ["accepted", "approved", "reassigned"].includes(primaryTrip.operational_status) ? (
                    <>
                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        <button type="button" onClick={() => setDetailOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#E5E0D4] text-sm font-semibold text-[#111]">
                          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                          Passageiros
                        </button>
                        <span className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-emerald-50 text-sm font-semibold text-emerald-800">✓ Confirmada</span>
                      </div>
                      <div className="mt-2.5">
                        <SwipeToConfirm label="Deslize para sair (a caminho)" busy={busyTrip === primaryTrip.id} onConfirm={() => void setStatus(primaryTrip.id, "on_the_way")} />
                      </div>
                      <p className="mt-1.5 text-center text-xs text-[#5C6067]">O passageiro é avisado que você saiu.</p>
                    </>
                  ) : (
                    <button type="button" onClick={() => setDetailOpen(true)} className="mt-3 h-14 w-full rounded-2xl bg-prime-gold text-base font-bold text-[#111]">
                      Continuar corrida
                    </button>
                  )}
                  {otherActive.length > 0 && onSeeAll ? (
                    <button type="button" onClick={onSeeAll} className="mt-2 w-full text-center text-xs text-[#6B6F76]">
                      + {otherActive.length} corrida{otherActive.length === 1 ? "" : "s"} agendada{otherActive.length === 1 ? "" : "s"} · ver agenda
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Detalhes completos da corrida */}
          {detailOpen && primaryTrip ? (
            <div className="fixed inset-0 z-[70] flex flex-col bg-black/30" role="dialog" aria-modal="true">
              <button type="button" aria-label="Fechar" className="min-h-[10dvh] flex-1" onClick={() => setDetailOpen(false)} />
              <div className="max-h-[90dvh] overflow-y-auto rounded-t-[28px] bg-[#F1F0EC] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
                <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#D9D3C5]" />
                <div className="mx-auto max-w-lg space-y-4">
                  <DriverActiveTripHero
                    trip={primaryTrip}
                    isBusy={busyTrip === primaryTrip.id}
                    highlighted={false}
                    waitElapsedLabel={primaryTrip.wait_started_at ? waitElapsedLabel : null}
                    waitBusy={waitBusy}
                    completeKm={completeKmByTrip[primaryTrip.id] ?? ""}
                    gpsTracking={getTripGpsState(primaryTrip.id)}
                    onCompleteKmChange={(id, value) => setCompleteKmByTrip((prev) => ({ ...prev, [id]: value }))}
                    onStatus={(id, st) => {
                      setDetailOpen(false);
                      void setStatus(id, st);
                    }}
                    onCompletePickupStop={(id, idx) => void completePickupStop(id, idx)}
                    onGps={sendGps}
                    onWaitStart={(id) => void setWait(id, "start")}
                    onWaitStop={(id) => void setWait(id, "stop")}
                  />
                  {["dispatched", "accepted", "approved", "reassigned"].includes(primaryTrip.operational_status) ? (
                    <>
                      <DriverPassengerContact trip={primaryTrip} devFallbackRole={devFallbackRole} />
                      <DriverDeclineButton
                        tripId={primaryTrip.id}
                        devFallbackRole={devFallbackRole}
                        onDeclined={() => {
                          setDetailOpen(false);
                          setMessage("Corrida devolvida para a central.");
                          void load();
                        }}
                      />
                    </>
                  ) : null}
                  <DriverPassengerLink tripId={primaryTrip.id} status={primaryTrip.operational_status} devFallbackRole={devFallbackRole} />
                  {["on_the_way", "arrived", "in_progress"].includes(primaryTrip.operational_status) ? (
                    <DriverTripExpenses tripId={primaryTrip.id} devFallbackRole={devFallbackRole} />
                  ) : null}
                  <button type="button" onClick={() => setDetailOpen(false)} className="w-full rounded-2xl py-3 text-sm text-[#6B6F76]">
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {view === "agenda" ? (
        <DriverAgenda
          loading={loading}
          trips={active}
          filter={agendaFilter}
          onFilter={setAgendaFilter}
          onOpen={(t) => {
            if (t.id === primaryTrip?.id) {
              onGoHome?.();
              setDetailOpen(true);
            }
          }}
          primaryId={primaryTrip?.id ?? null}
        />
      ) : null}

      {sheet && !geoBlock && trips.find((t) => t.id === sheet.tripId) ? (
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
        <DriverHistory trips={recentHistory} month={histMonth} onMonth={setHistMonth} summary={summary} payByTrip={payByTrip} />
      ) : null}
    </div>
    </>
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

/** Parceiro: quanto recebe por esta corrida e quando (previsão). Funcionário não recebe o valor da API. */
function DriverPayLine({ trip }: { trip: Trip }) {
  const amount = trip.driver_amount == null ? null : Number(trip.driver_amount);
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const date = trip.driver_payout_date
    ? new Date(`${trip.driver_payout_date}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" })
    : null;
  return (
    <p className="mt-2 flex items-center justify-between rounded-xl bg-[#F4FAF6] px-3 py-2 text-sm">
      <span className="text-[#1F7A4C]">
        {trip.operational_status === "completed"
          ? (trip as Trip & { reviewed_at?: string | null }).reviewed_at
            ? "✓ Confirmada pela central"
            : "Em conferência pela central"
          : "Você recebe"}
        {date ? ` · previsto ${date}` : ""}
      </span>
      <span className="font-bold text-[#111]">{amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
    </p>
  );
}

const ymdSp = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const firstPart = (a?: string | null) => String(a ?? "—").split(",")[0];

/** Agenda: filtros por dia, "a confirmar" no topo e linha do tempo. */
function DriverAgenda({
  loading,
  trips,
  filter,
  onFilter,
  onOpen,
  primaryId
}: {
  loading: boolean;
  trips: Trip[];
  filter: "hoje" | "amanha" | "semana";
  onFilter: (f: "hoje" | "amanha" | "semana") => void;
  onOpen: (t: Trip) => void;
  primaryId: string | null;
}) {
  const today = ymdSp(new Date().toISOString());
  const tomorrow = ymdSp(new Date(Date.now() + 86400000).toISOString());
  const weekEnd = ymdSp(new Date(Date.now() + 7 * 86400000).toISOString());
  const inFilter = (t: Trip, f: typeof filter) => {
    const d = t.scheduled_at ? ymdSp(t.scheduled_at) : "";
    return f === "hoje" ? d <= today : f === "amanha" ? d === tomorrow : d <= weekEnd;
  };
  const counts = { hoje: trips.filter((t) => inFilter(t, "hoje")).length, amanha: trips.filter((t) => inFilter(t, "amanha")).length, semana: trips.filter((t) => inFilter(t, "semana")).length };
  const toConfirm = trips.filter((t) => t.operational_status === "dispatched");
  const list = trips.filter((t) => inFilter(t, filter) && t.operational_status !== "dispatched");
  const chips: { id: typeof filter; label: string }[] = [
    { id: "hoje", label: "Hoje" },
    { id: "amanha", label: "Amanhã" },
    { id: "semana", label: "Semana" }
  ];
  return (
    <section className="space-y-3">
      <div className="flex gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onFilter(c.id)}
            className={`rounded-full px-3.5 py-2 text-[13px] font-bold ${filter === c.id ? "bg-[#111] text-white" : "border border-[#E5E0D4] bg-white text-[#111]"}`}
          >
            {c.label} · {counts[c.id]}
          </button>
        ))}
      </div>

      {loading ? (
        <DriverTripSkeleton />
      ) : (
        <>
          {toConfirm.map((t) => (
            <button key={t.id} type="button" onClick={() => onOpen(t)} className="block w-full rounded-[20px] border border-[#EBD9A6] bg-[#FBF5E6] px-4 py-3.5 text-left">
              <span className="flex items-center justify-between text-[11px] font-bold tracking-[0.1em] text-[#8A6A1F]">
                <span>A CONFIRMAR</span>
                {t.id === primaryId ? <span className="font-semibold tracking-normal">toque para abrir</span> : null}
              </span>
              <span className="mt-1 block text-[17px] font-extrabold text-[#111]">
                {groupByDay([t])[0]?.label} · {hhmm(t.scheduled_at)} · {firstPart(t.destination_text)}
              </span>
              <span className="block truncate text-[13px] text-[#5C6067]">
                {tripPeopleLabel(t) || "Passageiro"}
                {t.flight_number ? ` · Voo ${t.flight_number}` : ""}
              </span>
            </button>
          ))}

          {list.length === 0 && toConfirm.length === 0 ? (
            <div className="rounded-[20px] bg-white p-6 text-center text-sm text-[#6B6F76]">Nenhuma corrida {filter === "hoje" ? "hoje" : filter === "amanha" ? "amanhã" : "nos próximos dias"}.</div>
          ) : null}

          {groupByDay(list).map((g) => (
            <div key={g.key}>
              {filter === "semana" ? <p className="mb-2 mt-1 px-1 text-xs font-bold uppercase tracking-[0.1em] text-[#8A6A1F]">{g.label}</p> : null}
              <ol className="space-y-2.5">
                {g.trips.map((t) => {
                  const confirmed = ["accepted", "approved", "reassigned"].includes(t.operational_status);
                  const live = ["on_the_way", "arrived", "in_progress"].includes(t.operational_status);
                  return (
                    <li key={t.id} className="grid grid-cols-[52px_1fr] gap-2">
                      <span className="pt-3 text-[15px] font-extrabold tabular-nums text-[#111]">{hhmm(t.scheduled_at)}</span>
                      <button type="button" onClick={() => onOpen(t)} className="min-w-0 rounded-[18px] bg-white px-4 py-3 text-left shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
                        <span className="flex flex-wrap gap-1.5">
                          {tripTags(t).map((tag) => (
                            <span key={tag} className="rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11px] font-bold text-[#1B4E7A]">
                              {tag}
                            </span>
                          ))}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? "bg-[#FBF5E6] text-[#8A5A00]" : confirmed ? "bg-[#E7F6EC] text-[#11461F]" : "bg-[#F1EFEA] text-[#6F6A60]"}`}>
                            {live ? "Em andamento" : confirmed ? "Confirmada" : STATUS_CORRIDA_PT[t.operational_status]}
                          </span>
                        </span>
                        <span className="mt-1.5 block truncate text-[15px] font-extrabold text-[#111]">{tripPeopleLabel(t) || "Passageiro"}</span>
                        <span className="block truncate text-[13px] text-[#5C6067]">
                          {firstPart(t.origin_text)} → {firstPart(t.destination_text)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

const MONTH_PT = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

/** Histórico: filtro por mês, resumo do mês e cartões com a nota do passageiro. */
function DriverHistory({
  trips,
  month,
  onMonth,
  summary,
  payByTrip
}: {
  trips: Trip[];
  month: string;
  onMonth: (m: string) => void;
  summary: DriverSummary | null;
  payByTrip: Record<string, { stage: string; amount: number; paid_at: string | null }>;
}) {
  const months = Array.from({ length: 4 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(15);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const list = trips.filter((t) => t.scheduled_at && ymdSp(t.scheduled_at).slice(0, 7) === month);
  const m = summary?.months[month];
  const kmLocal = Math.round(list.reduce((n, t) => n + (Number(t.actual_km ?? t.planned_km ?? 0) || 0), 0));
  const done = list.filter((t) => t.operational_status === "completed").length;
  const groups = groupByDay([...list].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()));
  return (
    <section className="space-y-3">
      <div className="-mt-1 flex justify-end">
        <label className="relative">
          <span className="sr-only">Mês</span>
          <select
            value={month}
            onChange={(e) => onMonth(e.target.value)}
            className="appearance-none rounded-full border border-[#E5E0D4] bg-white py-2 pl-3.5 pr-8 text-[13px] font-bold capitalize text-[#111]"
          >
            {months.map((x) => (
              <option key={x} value={x}>
                {MONTH_PT(x)}
              </option>
            ))}
          </select>
          <svg aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { l: "Corridas", v: String(m?.trips ?? done) },
          { l: "KM rodados", v: (m?.km ?? kmLocal).toLocaleString("pt-BR") },
          { l: "Nota média", v: fmtRating(summary?.month_rating[month] ?? null) }
        ].map((x) => (
          <div key={x.l} className="rounded-[18px] bg-white px-3.5 py-3">
            <p className="text-xs font-semibold text-[#5C6067]">{x.l}</p>
            <p className="mt-0.5 text-[22px] font-extrabold text-[#111]">{x.v}</p>
          </div>
        ))}
      </div>

      {list.length === 0 ? <div className="rounded-[20px] bg-white p-6 text-center text-sm text-[#6B6F76]">Nenhuma corrida neste mês.</div> : null}

      {groups.map((g) => (
        <div key={g.key} className="space-y-2.5">
          <p className="mt-1 px-1 text-xs font-bold uppercase tracking-[0.1em] text-[#8A6A1F]">{g.label.startsWith("Atrasadas") ? new Date(`${g.key}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" }) : g.label}</p>
          {g.trips.map((t) => {
            const r = summary?.ratings_by_trip[t.id];
            const pay = payByTrip[t.id];
            const km = Number(t.actual_km ?? t.planned_km ?? 0) || 0;
            return (
              <div key={t.id} className="rounded-[18px] bg-white px-4 py-3.5 shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-[15px] font-extrabold text-[#111]">
                    {hhmm(t.scheduled_at)} · {tripPeopleLabel(t) || "Passageiro"}
                  </span>
                  {t.operational_status !== "completed" ? (
                    <StatusBadge status={t.operational_status} />
                  ) : r ? (
                    <span className="shrink-0 text-[13px] font-bold text-[#8A6A1F]">★ {r.stars}</span>
                  ) : (
                    <span className="shrink-0 text-[13px] font-semibold text-[#5C6067]">sem nota</span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm text-[#5C6067]">
                  {firstPart(t.origin_text)} → {firstPart(t.destination_text)}
                  {km > 0 ? ` · ${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : ""}
                </p>
                {r?.comment ? <p className="mt-2 text-[13px] italic text-[#3B3E44]">“{r.comment}”</p> : null}
                {pay ? (
                  <p className="mt-2 flex items-center justify-between text-xs">
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${pay.stage === "pago" ? "bg-[#EAF6EF] text-[#1F7A4C]" : pay.stage === "liberado" ? "bg-[#FBF3E0] text-[#8A5A00]" : "bg-[#F1EFEA] text-[#6F6A60]"}`}>
                      {pay.stage === "pago"
                        ? `✓ Pago${pay.paid_at ? ` em ${new Date(pay.paid_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""}`
                        : pay.stage === "liberado"
                          ? "Liberado · no próximo repasse"
                          : "A receber"}
                    </span>
                    <span className="font-semibold text-[#111]">{pay.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
