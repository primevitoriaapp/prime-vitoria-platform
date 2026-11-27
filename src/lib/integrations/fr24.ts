/**
 * Flightradar24 API (plano Explorer da Prime Locadora).
 * Duas consultas por checagem: "resumo do voo" (decolou/pousou, horário real) e "posição ao vivo" (previsão de chegada).
 * A parte de interpretação (fr24Snapshot) não acessa rede: dá para testar.
 */
import type { FlightLeg } from "@/lib/integrations/flight-status";

export const FR24_BASE = "https://fr24api.flightradar24.com/api";

export type Fr24Summary = {
  fr24_id?: string | null;
  flight?: string | null;
  orig_iata?: string | null;
  dest_iata?: string | null;
  dest_iata_actual?: string | null;
  datetime_takeoff?: string | null;
  datetime_landed?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  flight_ended?: boolean | null;
};
export type Fr24Live = {
  fr24_id?: string | null;
  flight?: string | null;
  orig_iata?: string | null;
  dest_iata?: string | null;
  eta?: string | null;
  timestamp?: string | null;
  alt?: number | null;
  gspeed?: number | null;
};

export type Fr24Snapshot = {
  leg: FlightLeg;
  /** Expected (ainda não decolou) · EnRoute (voando) · Arrived (pousou) · Diverted (pousou em outro aeroporto) */
  status: "Expected" | "EnRoute" | "Arrived" | "Diverted";
  airport: string | null;
  departedAt: string | null;
  landedAt: string | null;
  /** Previsão de pouso (ou pouso real). */
  etaAt: string | null;
  /** Minutos depois do horário da corrida (positivo = atrasado). */
  delayMinutes: number | null;
};

const iso = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const d = new Date(s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Data/hora no formato que a API aceita: 2026-11-27T10:00:00 (UTC). */
export function fr24Time(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/**
 * Junta resumo + posição ao vivo do mesmo voo e devolve a situação para a corrida.
 * `tripAtIso` é o horário da corrida (para buscar no aeroporto, normalmente o horário do pouso).
 */
export function fr24Snapshot(summaries: Fr24Summary[], live: Fr24Live[], leg: FlightLeg, tripAtIso: string): Fr24Snapshot | null {
  const tripAt = new Date(tripAtIso).getTime();
  // O mesmo número pode ter vários trechos no período: fica com o mais perto do horário da corrida.
  const ref = (s: Fr24Summary) => {
    const t = leg === "arrival" ? (iso(s.datetime_landed) ?? iso(s.last_seen) ?? iso(s.datetime_takeoff)) : (iso(s.datetime_takeoff) ?? iso(s.first_seen));
    return t ? Math.abs(new Date(t).getTime() - tripAt) : Number.MAX_SAFE_INTEGER;
  };
  const sum = [...summaries].sort((a, b) => ref(a) - ref(b))[0] ?? null;
  const lv = (sum?.fr24_id ? live.find((l) => l.fr24_id === sum.fr24_id) : null) ?? live[0] ?? null;
  if (!sum && !lv) return null;
  if (sum && ref(sum) > 20 * 3600_000 && !lv) return null;

  const departedAt = iso(sum?.datetime_takeoff);
  const landedAt = iso(sum?.datetime_landed);
  const ended = Boolean(sum?.flight_ended) || Boolean(landedAt);
  const planned = (sum?.dest_iata ?? lv?.dest_iata ?? "").toUpperCase();
  const actual = (sum?.dest_iata_actual ?? "").toUpperCase();
  const diverted = ended && Boolean(actual) && Boolean(planned) && actual !== planned;

  let status: Fr24Snapshot["status"] = "Expected";
  if (diverted) status = "Diverted";
  else if (ended) status = "Arrived";
  else if (departedAt || lv) status = "EnRoute";

  const etaAt = landedAt ?? iso(lv?.eta) ?? null;
  const delayMinutes = leg === "arrival" && etaAt ? Math.round((new Date(etaAt).getTime() - tripAt) / 60_000) : null;
  return {
    leg,
    status,
    airport: (leg === "arrival" ? planned : (sum?.orig_iata ?? lv?.orig_iata ?? "").toUpperCase()) || null,
    departedAt,
    landedAt,
    etaAt,
    delayMinutes
  };
}

/** Consulta o Flightradar24 (resumo do voo + posição ao vivo). */
export async function fetchFr24(token: string, number: string, tripAtIso: string): Promise<{ summaries: Fr24Summary[]; live: Fr24Live[] }> {
  const headers = { Accept: "application/json", "Accept-Version": "v1", Authorization: `Bearer ${token}` };
  const at = new Date(tripAtIso).getTime();
  const q = new URLSearchParams({ flights: number, flight_datetime_from: fr24Time(at - 14 * 3600_000), flight_datetime_to: fr24Time(Math.min(at + 6 * 3600_000, Date.now())) });
  const get = async (path: string) => {
    const res = await fetch(`${FR24_BASE}${path}`, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) throw new Error("Chave do Flightradar24 recusada (confira em Integrações)");
    if (res.status === 402 || res.status === 429) throw new Error("Créditos do Flightradar24 esgotados ou limite de consultas");
    if (res.status === 404 || res.status === 204) return [];
    if (!res.ok) throw new Error(`Flightradar24 respondeu ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { data?: unknown[] };
    return Array.isArray(j.data) ? j.data : [];
  };
  const fromMs = at - 14 * 3600_000;
  const summaries = fromMs < Date.now() ? ((await get(`/flight-summary/full?${q}`)) as Fr24Summary[]) : [];
  const live = (await get(`/live/flight-positions/full?flights=${encodeURIComponent(number)}`)) as Fr24Live[];
  return { summaries, live };
}

const hhmm = (isoStr: string) => new Date(isoStr).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export type Fr24Alert = { key: string; title: string; driverBody: string; staffBody: string };

/** Quais avisos dar agora, comparando com os que já foram dados (flight_alerts). Só para buscar no aeroporto. */
export function fr24AlertsToSend(t: { flight_number: string | null; passenger_name: string | null; scheduled_at: string; flight_alerts?: Record<string, unknown> | null }, snap: Fr24Snapshot, nowMs = Date.now()): Fr24Alert[] {
  if (snap.leg !== "arrival") return [];
  const done = (t.flight_alerts ?? {}) as Record<string, unknown>;
  const out: Fr24Alert[] = [];
  const f = t.flight_number ?? "";
  const pax = t.passenger_name?.trim() || "seu passageiro";
  const corrida = `corrida das ${hhmm(t.scheduled_at)}`;
  const tripAt = new Date(t.scheduled_at).getTime();
  if (snap.status === "Diverted" && !done.diverted) {
    out.push({ key: "diverted", title: `⚠️ Voo ${f} pousou em outro aeroporto`, driverBody: `${pax} · aguarde orientação da central.`, staffBody: `${pax} · ${corrida}. Confirme com o passageiro.` });
  }
  if (snap.status === "Arrived" && !done.landed) {
    out.push({ key: "landed", title: `🛬 Voo ${f} pousou às ${snap.landedAt ? hhmm(snap.landedAt) : "agora"}`, driverBody: `${pax} deve sair do desembarque em ~15 a 25 min.`, staffBody: `${pax} · ${corrida}.` });
  }
  if ((snap.status === "EnRoute" || snap.status === "Arrived") && snap.departedAt && !done.departed && snap.status !== "Arrived") {
    out.push({
      key: "departed",
      title: `✈️ Seu passageiro decolou às ${hhmm(snap.departedAt)}`,
      driverBody: `Voo ${f} · ${pax}${snap.etaAt ? ` · pouso previsto ${hhmm(snap.etaAt)}` : ""}.`,
      staffBody: `Voo ${f} · ${pax} · ${corrida}${snap.etaAt ? ` · pouso previsto ${hhmm(snap.etaAt)}` : ""}.`
    });
  }
  if (snap.status === "EnRoute" && snap.delayMinutes != null && snap.delayMinutes >= 15) {
    const last = Number(done.delay ?? 0);
    if (!last || snap.delayMinutes - last >= 15) {
      out.push({
        key: "delay",
        title: `🔴 Voo ${f} atrasado ~${snap.delayMinutes} min`,
        driverBody: `Pouso previsto ${snap.etaAt ? hhmm(snap.etaAt) : "—"} · ${pax} deve atrasar. A central confirma se o horário muda.`,
        staffBody: `${pax} · ${corrida} · pouso previsto ${snap.etaAt ? hhmm(snap.etaAt) : "—"}. Ajuste o horário se precisar.`
      });
    }
  }
  if (snap.status === "Expected" && !done.notakeoff && nowMs > tripAt - 40 * 60_000) {
    out.push({
      key: "notakeoff",
      title: `⚠️ Voo ${f} ainda não decolou`,
      driverBody: `${pax} · o voo vai atrasar ou foi cancelado. Aguarde a central.`,
      staffBody: `${pax} · ${corrida}. Confirme com o passageiro/cliente.`
    });
  }
  return out;
}


/**
 * Quando consultar de novo no Flightradar24 (cabe folgado nos créditos do plano):
 * começa 5h antes da corrida; a cada 20 min antes de decolar; a cada 5 min com o avião voando;
 * para quando pousa (ou 3h depois do horário).
 */
export function fr24CheckDue(input: { scheduledAt: string; checkedAt: string | null; status: string | null; now?: number }): boolean {
  const now = input.now ?? Date.now();
  const ahead = (new Date(input.scheduledAt).getTime() - now) / 60_000;
  if (ahead > 300 || ahead < -180) return false;
  if (/arrived|diverted/i.test(input.status ?? "")) return false;
  if (!input.checkedAt) return true;
  const since = (now - new Date(input.checkedAt).getTime()) / 60_000;
  const flying = /enroute/i.test(input.status ?? "");
  const gap = flying || ahead < 60 ? 5 : 20;
  return since >= gap - 0.5;
}
