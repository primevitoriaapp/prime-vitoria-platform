import { db } from "@/lib/server/db";
import { normalizeFlightNumber } from "@/lib/trips/flight";
import {
  flightChangeWorthAlert,
  flightCheckDue,
  flightLegForTrip,
  flightStatusLabel,
  isFlightProblem,
  pickFlight,
  spDate,
  type AdbFlight,
  type FlightSnapshot
} from "@/lib/integrations/flight-status";

const RAPID_HOST = "aerodatabox.p.rapidapi.com";
const APIMARKET_BASE = "https://prod.api.market/api/v1/aedbx/aerodatabox";
const FINAL = ["completed", "cancelled", "rejected", "no_show"];

/** Chave do AeroDataBox: pelo RapidAPI ou pelo API.Market (o mesmo serviço, vendido em dois lugares). */
function flightProvider(): { url: (path: string) => string; headers: Record<string, string> } | null {
  const rapid = process.env.AERODATABOX_RAPIDAPI_KEY?.trim();
  if (rapid) return { url: (p) => `https://${RAPID_HOST}${p}`, headers: { "X-RapidAPI-Key": rapid, "X-RapidAPI-Host": RAPID_HOST } };
  const market = process.env.AERODATABOX_APIMARKET_KEY?.trim();
  if (market) return { url: (p) => `${APIMARKET_BASE}${p}`, headers: { "x-api-market-key": market, "x-magicapi-key": market, "x-api-key": market } };
  return null;
}

export function flightApiConfigured(): boolean {
  return flightProvider() != null;
}

async function fetchFlights(number: string, date: string): Promise<AdbFlight[]> {
  const provider = flightProvider();
  if (!provider) throw new Error("Chave do AeroDataBox não configurada");
  const url = provider.url(`/flights/number/${encodeURIComponent(number)}/${date}?withAircraftImage=false&withLocation=false&dateLocalRole=Both`);
  const res = await fetch(url, { headers: provider.headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (res.status === 204 || res.status === 404) return [];
  if (res.status === 429) throw new Error("Cota mensal do serviço de voos esgotada");
  if (res.status === 401 || res.status === 403) throw new Error("Chave do serviço de voos recusada (confira a chave no Vercel)");
  if (!res.ok) throw new Error(`Serviço de voos respondeu ${res.status}`);
  const json = (await res.json().catch(() => [])) as AdbFlight[] | AdbFlight;
  return Array.isArray(json) ? json : [json];
}

type WatchTrip = {
  id: string;
  tenant_id: string;
  scheduled_at: string;
  flight_number: string | null;
  origin_text: string | null;
  destination_text: string | null;
  driver_id: string | null;
  operational_status: string;
  passenger_name: string | null;
  flight_status: string | null;
  flight_eta: string | null;
  flight_checked_at: string | null;
  flight_check_count: number | null;
};

const COLS =
  "id, tenant_id, scheduled_at, flight_number, origin_text, destination_text, driver_id, operational_status, passenger_name, flight_status, flight_eta, flight_checked_at, flight_check_count";

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

async function alertChange(t: WatchTrip, snap: FlightSnapshot) {
  const pax = t.passenger_name?.trim() || "passageiro";
  const what = snap.leg === "arrival" ? "pouso" : "decolagem";
  const title = isFlightProblem(snap.status)
    ? `✈ Voo ${t.flight_number} ${flightStatusLabel(snap.status).toLowerCase()}`
    : `✈ Voo ${t.flight_number}: ${what} agora às ${snap.etaAt ? hhmm(snap.etaAt) : "?"}`;
  const body = `${pax} · corrida das ${hhmm(t.scheduled_at)}${
    snap.delayMinutes && snap.delayMinutes > 0 ? ` · atraso de ${snap.delayMinutes} min` : ""
  }. Confira se precisa mudar o horário.`;
  const url = `/agenda?trip=${t.id}`;
  const { pushToStaff, pushToDriver } = await import("@/lib/push/web-push");
  await pushToStaff(t.tenant_id, { title, body, url, tag: `flight-${t.id}` }).catch(() => 0);
  await import("@/lib/notifications/enqueue-for-profiles")
    .then(({ enqueueInAppForTenantRoles }) =>
      enqueueInAppForTenantRoles(t.tenant_id, ["admin", "operador"], { eventType: "trips.flight_change", title, body })
    )
    .catch(() => 0);
  if (t.driver_id) {
    await pushToDriver(t.tenant_id, t.driver_id, {
      title,
      body: `${pax} · a central vai confirmar se o horário da corrida muda.`,
      url: `/driver`,
      tag: `flight-${t.id}`
    }).catch(() => 0);
  }
}

export type FlightCheckResult = { ok: true; snapshot: FlightSnapshot | null; alerted: boolean } | { ok: false; reason: string };

/** Consulta o voo de uma corrida agora e grava o resultado. `manual` não conta na cota automática. */
export async function checkTripFlight(tripId: string, opts: { manual?: boolean } = {}): Promise<FlightCheckResult> {
  const { data } = await db.from("trips").select(COLS).eq("id", tripId).maybeSingle();
  const t = data as WatchTrip | null;
  if (!t) return { ok: false, reason: "Corrida não encontrada" };
  const number = normalizeFlightNumber(t.flight_number);
  if (!number) return { ok: false, reason: "Número de voo inválido" };
  const leg = flightLegForTrip(t.origin_text, t.destination_text);
  const now = new Date().toISOString();
  try {
    const flights = await fetchFlights(number, spDate(t.scheduled_at));
    const snap = pickFlight(flights, leg, t.scheduled_at);
    const alerted = snap ? flightChangeWorthAlert({ etaAt: t.flight_eta, status: t.flight_status }, snap) : false;
    await db
      .from("trips")
      .update({
        flight_leg: leg,
        flight_status: snap?.status ?? "NotFound",
        flight_scheduled_at: snap?.scheduledAt ?? null,
        flight_eta: snap?.etaAt ?? null,
        flight_delay_minutes: snap?.delayMinutes ?? null,
        flight_airport: snap?.airport ?? null,
        flight_checked_at: now,
        flight_check_count: (t.flight_check_count ?? 0) + (opts.manual ? 0 : 1),
        flight_error: snap ? null : "Voo não encontrado para esta data"
      })
      .eq("id", t.id);
    if (snap && alerted) await alertChange(t, snap);
    return { ok: true, snapshot: snap, alerted };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Erro ao consultar o voo";
    await db
      .from("trips")
      .update({ flight_checked_at: now, flight_check_count: (t.flight_check_count ?? 0) + (opts.manual ? 0 : 1), flight_error: reason.slice(0, 200) })
      .eq("id", t.id);
    return { ok: false, reason };
  }
}

const SWEEP_KEY = "flight_sweep_at";

/**
 * Passada automática: confere os voos das próximas horas que estão "na vez".
 * Roda no máximo a cada 5 minutos para o sistema todo (trava em app_secrets).
 */
export async function sweepDueFlights(): Promise<{ checked: number; skipped?: string }> {
  if (!flightApiConfigured()) return { checked: 0, skipped: "sem chave" };
  const nowMs = Date.now();
  const { data: lock } = await db.from("app_secrets").select("value").eq("key", SWEEP_KEY).maybeSingle();
  const last = Number((lock?.value as { at?: number } | null)?.at ?? 0);
  if (nowMs - last < 5 * 60_000) return { checked: 0, skipped: "recente" };
  await db.from("app_secrets").upsert({ key: SWEEP_KEY, value: { at: nowMs } });

  const from = new Date(nowMs - 2 * 3600_000).toISOString();
  const to = new Date(nowMs + 6 * 3600_000).toISOString();
  const { data } = await db
    .from("trips")
    .select(COLS)
    .not("flight_number", "is", null)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .not("operational_status", "in", `(${FINAL.join(",")})`)
    .limit(30);
  const due = ((data ?? []) as WatchTrip[]).filter((t) =>
    flightCheckDue({ scheduledAt: t.scheduled_at, checkedAt: t.flight_checked_at, checkCount: t.flight_check_count ?? 0, status: t.flight_status })
  );
  let checked = 0;
  for (const t of due.slice(0, 8)) {
    await checkTripFlight(t.id);
    checked++;
  }
  return { checked };
}
