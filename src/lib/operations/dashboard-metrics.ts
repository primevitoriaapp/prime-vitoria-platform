/** Indicadores do Dashboard (funções puras, testadas). */
import { brToday } from "./booking-periods.ts";

export type DashPeriod = "hoje" | "7d" | "mes" | "ano";

export const DASH_PERIODS: { id: DashPeriod; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "mes", label: "Este mês" },
  { id: "ano", label: "Este ano" }
];

const DAY = 86400000;
const start = (d: string) => new Date(`${d}T00:00:00-03:00`).getTime();
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Período atual e o anterior de mesmo tamanho (para comparar). Fim exclusivo. */
export function dashRanges(period: DashPeriod, now: Date = new Date()) {
  const today = brToday(now);
  let from: number;
  let to: number;
  let prevFrom: number;
  let prevTo: number;
  if (period === "hoje") {
    from = start(today);
    to = start(addDays(today, 1));
    prevFrom = start(addDays(today, -1));
    prevTo = from;
  } else if (period === "7d") {
    from = start(addDays(today, -6));
    to = start(addDays(today, 1));
    prevFrom = start(addDays(today, -13));
    prevTo = from;
  } else if (period === "mes") {
    const [y, m] = today.split("-").map(Number);
    from = start(`${today.slice(0, 7)}-01`);
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    to = start(next);
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    prevFrom = start(prev);
    prevTo = from;
  } else {
    const y = Number(today.slice(0, 4));
    from = start(`${y}-01-01`);
    to = start(`${y + 1}-01-01`);
    prevFrom = start(`${y - 1}-01-01`);
    prevTo = from;
  }
  const iso = (n: number) => new Date(n).toISOString();
  return { from: iso(from), to: iso(to), prevFrom: iso(prevFrom), prevTo: iso(prevTo) };
}

export type MetricTrip = {
  operational_status: string;
  client_amount: number | null;
  driver_amount: number | null;
  client_id: string | null;
  driver_id: string | null;
};

const CANCELLED = new Set(["cancelled", "rejected", "no_show"]);
const ACTIVE = new Set(["on_the_way", "arrived", "in_progress"]);

export function summarize(trips: MetricTrip[]) {
  let completed = 0;
  let cancelled = 0;
  let active = 0;
  let revenue = 0;
  let payout = 0;
  let completedNoValue = 0;
  for (const t of trips) {
    if (t.operational_status === "completed") {
      completed += 1;
      const c = Number(t.client_amount) || 0;
      revenue += c;
      payout += Number(t.driver_amount) || 0;
      if (c <= 0) completedNoValue += 1;
    } else if (CANCELLED.has(t.operational_status)) cancelled += 1;
    else if (ACTIVE.has(t.operational_status)) active += 1;
  }
  const total = trips.length;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total,
    completed,
    cancelled,
    active,
    revenue: round(revenue),
    payout: round(payout),
    profit: round(revenue - payout),
    avgTicket: completed > 0 ? round(revenue / completed) : 0,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    cancelRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
    completedNoValue
  };
}

/** Variação % (null quando não dá para comparar). */
export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 100);
}

export function topBy<T extends MetricTrip>(
  trips: T[],
  key: "client_id" | "driver_id",
  limit = 5
): { id: string; trips: number; revenue: number }[] {
  const map = new Map<string, { id: string; trips: number; revenue: number }>();
  for (const t of trips) {
    const id = t[key];
    if (!id || CANCELLED.has(t.operational_status)) continue;
    const row = map.get(id) ?? { id, trips: 0, revenue: 0 };
    row.trips += 1;
    if (t.operational_status === "completed") row.revenue += Number(t.client_amount) || 0;
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.trips - a.trips).slice(0, limit);
}

export type SeriesPoint = { key: string; label: string; revenue: number; profit: number; trips: number };

const ymdSp = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Intervalo do gráfico: Hoje mostra os últimos 14 dias (um dia só não faz gráfico), 7 dias, mês por dia, ano por mês. */
export function seriesRange(period: DashPeriod, now: Date = new Date()) {
  const today = brToday(now);
  if (period === "hoje" || period === "7d") {
    const days = period === "hoje" ? 14 : 7;
    return { from: new Date(start(addDays(today, -(days - 1)))).toISOString(), to: new Date(start(addDays(today, 1))).toISOString(), unit: "day" as const, firstDay: addDays(today, -(days - 1)), days };
  }
  const r = dashRanges(period, now);
  if (period === "mes") {
    const [y, m] = today.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: r.from, to: r.to, unit: "day" as const, firstDay: `${today.slice(0, 7)}-01`, days };
  }
  return { from: r.from, to: r.to, unit: "month" as const, firstDay: `${today.slice(0, 4)}-01-01`, days: 12 };
}

/** Faturamento, lucro e corridas por dia (ou por mês no ano). Só corridas finalizadas entram no dinheiro. */
export function buildSeries(trips: (MetricTrip & { scheduled_at: string })[], period: DashPeriod, now: Date = new Date()): SeriesPoint[] {
  const r = seriesRange(period, now);
  const points: SeriesPoint[] = [];
  if (r.unit === "day") {
    for (let i = 0; i < r.days; i++) {
      const d = addDays(r.firstDay, i);
      points.push({ key: d, label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, revenue: 0, profit: 0, trips: 0 });
    }
  } else {
    const y = r.firstDay.slice(0, 4);
    for (let m = 1; m <= 12; m++) points.push({ key: `${y}-${String(m).padStart(2, "0")}`, label: MONTHS[m - 1], revenue: 0, profit: 0, trips: 0 });
  }
  const idx = new Map(points.map((p, i) => [p.key, i]));
  for (const t of trips) {
    if (CANCELLED.has(t.operational_status)) continue;
    const day = ymdSp(t.scheduled_at);
    const i = idx.get(r.unit === "day" ? day : day.slice(0, 7));
    if (i === undefined) continue;
    points[i].trips += 1;
    if (t.operational_status === "completed") {
      const c = Number(t.client_amount) || 0;
      points[i].revenue += c;
      points[i].profit += c - (Number(t.driver_amount) || 0);
    }
  }
  return points.map((p) => ({ ...p, revenue: Math.round(p.revenue * 100) / 100, profit: Math.round(p.profit * 100) / 100 }));
}
