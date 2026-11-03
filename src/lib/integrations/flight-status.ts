/** Leitura do voo vindo do AeroDataBox e regras de quando consultar. Sem dependências: testável. */

export type FlightLeg = "arrival" | "departure";

export type FlightSnapshot = {
  leg: FlightLeg;
  status: string;
  airport: string | null;
  scheduledAt: string | null;
  etaAt: string | null;
  delayMinutes: number | null;
};

type Time = { utc?: string | null; local?: string | null } | null | undefined;
type Movement = {
  airport?: { iata?: string | null; icao?: string | null; name?: string | null; municipalityName?: string | null } | null;
  scheduledTime?: Time;
  revisedTime?: Time;
  predictedTime?: Time;
  runwayTime?: Time;
} | null | undefined;
export type AdbFlight = { status?: string | null; departure?: Movement; arrival?: Movement; number?: string | null };

const AIRPORT_RE = /\b(aeroporto|airport|aerop\.?|terminal de passageiros)\b|\(VIX\)|\bVIX\b|\bGRU\b|\bCGH\b|\bGIG\b|\bSDU\b|\bCNF\b|\bBSB\b/i;

export function looksLikeAirport(text: string | null | undefined): boolean {
  return AIRPORT_RE.test(text ?? "");
}

/** Buscar no aeroporto = acompanhar o pouso; levar ao aeroporto = acompanhar a decolagem. */
export function flightLegForTrip(origin: string | null | undefined, destination: string | null | undefined): FlightLeg {
  if (looksLikeAirport(origin)) return "arrival";
  if (looksLikeAirport(destination)) return "departure";
  return "arrival";
}

/** "2026-11-05 14:35Z" ou ISO → ISO; null se inválido. */
export function parseAdbTime(t: Time): string | null {
  const raw = t?.utc?.trim();
  if (!raw) return null;
  let s = raw.replace(" ", "T");
  if (/T\d{2}:\d{2}Z$/.test(s)) s = s.replace("Z", ":00Z");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const STATUS_PT: Record<string, string> = {
  Unknown: "Sem informação",
  Expected: "Previsto",
  EnRoute: "Em voo",
  CheckIn: "Check-in aberto",
  Boarding: "Embarcando",
  GateClosed: "Portão fechado",
  Departed: "Decolou",
  Delayed: "Atrasado",
  Approaching: "Pousando",
  Arrived: "Pousou",
  Canceled: "Cancelado",
  Cancelled: "Cancelado",
  Diverted: "Desviado",
  CanceledUncertain: "Possivelmente cancelado"
};

export function flightStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sem informação";
  return STATUS_PT[status] ?? status;
}

export function isFlightProblem(status: string | null | undefined): boolean {
  return /cancel|divert/i.test(status ?? "");
}

/**
 * Escolhe, entre os voos devolvidos (o mesmo número pode ter mais de um trecho no dia),
 * o trecho cujo horário previsto fica mais perto da corrida.
 */
export function pickFlight(flights: AdbFlight[], leg: FlightLeg, tripAtIso: string): FlightSnapshot | null {
  const tripAt = new Date(tripAtIso).getTime();
  let best: { snap: FlightSnapshot; dist: number } | null = null;
  for (const f of flights) {
    const m = leg === "arrival" ? f.arrival : f.departure;
    const scheduledAt = parseAdbTime(m?.scheduledTime);
    if (!scheduledAt) continue;
    const etaAt =
      parseAdbTime(m?.runwayTime) ?? parseAdbTime(m?.revisedTime) ?? parseAdbTime(m?.predictedTime) ?? scheduledAt;
    const delay = Math.round((new Date(etaAt).getTime() - new Date(scheduledAt).getTime()) / 60_000);
    const snap: FlightSnapshot = {
      leg,
      status: f.status ?? "Unknown",
      airport: m?.airport?.iata ?? m?.airport?.icao ?? null,
      scheduledAt,
      etaAt,
      delayMinutes: delay
    };
    const dist = Math.abs(new Date(scheduledAt).getTime() - tripAt);
    if (!best || dist < best.dist) best = { snap, dist };
  }
  // Mais de 18h de distância: provavelmente é outro dia/voo; não confia.
  if (!best || best.dist > 18 * 3600_000) return null;
  return best.snap;
}

export const MAX_AUTO_CHECKS = 5;

/**
 * Quando consultar de novo (economiza a cota grátis):
 * até 6h antes da corrida; 90 min entre consultas se faltar mais de 3h, 30 min se faltar 1–3h, 15 min na última hora;
 * para 2h depois do horário; no máximo 5 consultas automáticas por corrida.
 */
export function flightCheckDue(input: {
  scheduledAt: string;
  checkedAt: string | null;
  checkCount: number;
  status: string | null;
  now?: Date;
}): boolean {
  const now = (input.now ?? new Date()).getTime();
  const at = new Date(input.scheduledAt).getTime();
  const minutesAhead = (at - now) / 60_000;
  if (minutesAhead > 360 || minutesAhead < -120) return false;
  if (input.checkCount >= MAX_AUTO_CHECKS) return false;
  if (/arrived|landed|departed|cancel/i.test(input.status ?? "")) return false;
  if (!input.checkedAt) return true;
  const since = (now - new Date(input.checkedAt).getTime()) / 60_000;
  const gap = minutesAhead > 180 ? 90 : minutesAhead > 60 ? 30 : 15;
  return since >= gap;
}

/** Vale avisar a central/motorista? Mudança de 15 min ou mais no horário, ou cancelamento/desvio. */
export function flightChangeWorthAlert(prev: { etaAt: string | null; status: string | null }, next: FlightSnapshot): boolean {
  if (isFlightProblem(next.status) && !isFlightProblem(prev.status)) return true;
  if (!next.etaAt) return false;
  const base = prev.etaAt ?? next.scheduledAt;
  if (!base) return false;
  return Math.abs(new Date(next.etaAt).getTime() - new Date(base).getTime()) >= 15 * 60_000;
}

/** Data local (São Paulo) da corrida, para a consulta do voo. */
export function spDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
