"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { formatBrTime } from "@/lib/dates/br-date";
import { shortAddress } from "@/lib/client/short-address";
import { DASH_PERIODS, type DashPeriod, type SeriesPoint } from "@/lib/operations/dashboard-metrics";
import { useCompany, companyLabel } from "@/lib/company/company-context";
import { BOOKING_GROUPS, bookingGroupOf, bookingPeriodRange } from "@/lib/operations/booking-periods";

type Summary = {
  total: number;
  completed: number;
  cancelled: number;
  active: number;
  revenue: number | null;
  payout: number | null;
  profit: number | null;
  avgTicket: number | null;
  completionRate: number;
  cancelRate: number;
};

type Data = {
  summary: Summary;
  change: { total: number | null; revenue: number | null; profit: number | null };
  activeDrivers: number;
  topClients: { id: string; name: string; trips: number; revenue: number | null }[];
  topDrivers: { id: string; name: string; trips: number }[];
  alerts: { tone: "red" | "amber" | "blue"; text: string; href: string }[];
  series?: SeriesPoint[];
};

type NextTrip = {
  id: string;
  scheduled_at: string;
  operational_status: string;
  origin_text: string;
  destination_text: string;
  client_name?: string | null;
  passenger_name?: string | null;
  driver_name?: string | null;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n >= 1000 ? 0 : 2 });
const compact = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: n >= 10000 ? 0 : 1 })} mil` : `R$ ${Math.round(n)}`;

const PERIOD_SHORT: Record<DashPeriod, string> = { hoje: "Hoje", "7d": "7 dias", mes: "Este mês", ano: "Este ano" };
const COMPARE: Record<DashPeriod, string> = { hoje: "Comparado com ontem", "7d": "Comparado com os 7 dias anteriores", mes: "Comparado com o mês passado", ano: "Comparado com o ano passado" };
const CHART_TITLE: Record<DashPeriod, string> = {
  hoje: "Últimos 14 dias",
  "7d": "Últimos 7 dias",
  mes: "Dia a dia neste mês",
  ano: "Mês a mês neste ano"
};

function Delta({ v, invert }: { v: number | null | undefined; invert?: boolean }) {
  if (v == null) return null;
  const good = invert ? v <= 0 : v >= 0;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );
}

function Icon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  calendar: "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  alert: "M12 3l9.5 17h-19zM12 10v4M12 17.5v.01",
  money: "M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  car: "M5 16l1.5-5A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 1.5L19 16v3H5zM7 19v2M17 19v2",
  id: "M4 6h16v12H4zM8 10h4M8 14h8"
};

function alertIcon(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("pedido")) return ICONS.calendar;
  if (t.includes("passaram") || t.includes("finalizad")) return ICONS.clock;
  if (t.includes("gps") || t.includes("local")) return ICONS.pin;
  if (t.includes("conta") || t.includes("despesa") || t.includes("valor")) return ICONS.money;
  if (t.includes("avalia")) return ICONS.star;
  if (t.includes("veículo") || t.includes("motorista")) return ICONS.car;
  if (t.includes("cnh")) return ICONS.id;
  return ICONS.alert;
}

const ALERT_TONE = {
  red: "bg-orange-50 text-orange-700",
  amber: "bg-[#F7F0DE] text-[#8A6A1E]",
  blue: "bg-blue-50 text-blue-700"
};

/** Gráfico de barras: faturamento (preto) com o lucro (dourado) por dentro. Sem dinheiro, mostra corridas. */
function RevenueChart({ points, showMoney }: { points: SeriesPoint[]; showMoney: boolean }) {
  const W = 760;
  const H = 360;
  const left = 64;
  const bottom = 30;
  const top = 12;
  const plotH = H - bottom - top;
  const values = points.map((p) => (showMoney ? p.revenue : p.trips));
  const rawMax = Math.max(1, ...values);
  const step = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / step) * step;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const bw = (W - left - 8) / Math.max(1, points.length);
  const labelEvery = points.length > 16 ? 5 : points.length > 8 ? 2 : 1;
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const empty = values.every((v) => v === 0);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfico do período">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - 4} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#DCD8D0" : "#EFEDE8"} />
            <text x={left - 10} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#8B8F96">
              {showMoney ? (t === 0 ? "0" : compact(t)) : Math.round(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = left + i * bw + bw * 0.18;
          const w = Math.max(2, bw * 0.64);
          const v = showMoney ? p.revenue : p.trips;
          const h = (v / max) * plotH;
          const ph = showMoney ? (Math.max(0, p.profit) / max) * plotH : 0;
          return (
            <g key={p.key}>
              <title>
                {p.label}: {p.trips} corrida(s){showMoney ? ` · faturamento ${money(p.revenue)} · lucro ${money(p.profit)}` : ""}
              </title>
              <rect x={left + i * bw} y={top} width={bw} height={plotH} fill="transparent" />
              {h > 0 ? <rect x={x} y={y(v)} width={w} height={h} rx={Math.min(4, w / 2)} fill="#1A1B1E" /> : null}
              {ph > 0 ? <rect x={x} y={y(Math.max(0, p.profit))} width={w} height={ph} rx={Math.min(4, w / 2)} fill="#C9A84C" /> : null}
              {i % labelEvery === 0 || i === points.length - 1 ? (
                <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="#8B8F96">
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {empty ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-prime-muted">Sem corridas finalizadas neste período.</p>
      ) : null}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 300},${44 - (v / max) * 38}`);
  return (
    <svg viewBox="0 0 300 46" className="mt-4 h-11 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="pv-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" stopOpacity=".45" />
          <stop offset="1" stopColor="#C9A84C" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0,46 L${pts.join(" L")} L300,46 Z`} fill="url(#pv-spark)" />
      <path d={`M${pts.join(" L")}`} fill="none" stroke="#D9BC6A" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-prime-border bg-white shadow-prime-card ${className}`}>{children}</section>;
}

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-prime-text">{title}</h2>
        {sub ? <p className="mt-0.5 text-sm text-prime-muted">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

const dayLabel = (iso: string) => {
  const sp = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const d = sp(new Date(iso));
  const today = sp(new Date());
  const tomorrow = sp(new Date(Date.now() + 86400000));
  return d === today ? "hoje" : d === tomorrow ? "amanhã" : d.split("-").reverse().slice(0, 2).join("/");
};

/** Visão geral: avisos, indicadores principais, gráfico, próximas corridas e rankings. */
export function DashboardOverview({ tenantId, showMoney }: { tenantId: string | null; showMoney: boolean }) {
  const [period, setPeriod] = useState<DashPeriod>("mes");
  const [data, setData] = useState<Data | null>(null);
  const [next, setNext] = useState<NextTrip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { company } = useCompany();

  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession(`/api/reports/dashboard?period=${period}&empresa=${company}`, {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Data; error?: { message?: string } };
    if (res.ok && json.success && json.data) {
      setData(json.data);
      setError(null);
    } else setError(json.error?.message ?? "Não foi possível carregar os números.");

    const { to } = bookingPeriodRange("amanha");
    const qs = new URLSearchParams({ scheduledFrom: new Date(Date.now() - 2 * 3600000).toISOString(), scheduledTo: to, pageSize: "50", sortDir: "asc" });
    const r2 = await fetchWithSupabaseSession(`/api/trips?${qs}`, {}, "admin");
    const j2 = (await r2.json().catch(() => ({}))) as { success?: boolean; data?: { items: NextTrip[] } };
    if (r2.ok && j2.success) {
      setNext((j2.data?.items ?? []).filter((t) => ["agendada", "atribuida", "em_rota"].includes(bookingGroupOf(t.operational_status))).slice(0, 6));
    }
  }, [period, company]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips"], load);

  const s = data?.summary;
  const series = data?.series ?? [];
  const margin = s?.revenue ? Math.round(((s.profit ?? 0) / s.revenue) * 100) : null;
  const topRevenue = Math.max(1, ...(data?.topClients ?? []).map((c) => c.revenue ?? c.trips));
  const topTrips = Math.max(1, ...(data?.topDrivers ?? []).map((d) => d.trips));

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      {data && data.alerts.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.alerts.map((a) => (
            <Link
              key={a.text}
              href={a.href as Route}
              className="group flex items-center gap-4 rounded-2xl border border-prime-border bg-white px-4 py-3.5 shadow-prime-card transition hover:border-prime-gold"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ALERT_TONE[a.tone]}`}>
                <Icon d={alertIcon(a.text)} />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-prime-text">{a.text}</span>
              <span className="shrink-0 text-sm font-semibold text-prime-gold-ink group-hover:underline">Ver →</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="inline-flex rounded-xl bg-[#ECEAE5] p-1">
          {DASH_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-lg px-4 py-2 text-sm transition ${period === p.id ? "bg-white font-semibold text-prime-text shadow-sm" : "font-medium text-[#4A4D55] hover:text-prime-text"}`}
            >
              {PERIOD_SHORT[p.id]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-prime-muted">
          {company !== "todas" ? (
            <span className="rounded-full bg-[#111] px-3 py-1.5 text-xs font-semibold text-prime-gold">{companyLabel(company)}</span>
          ) : (
            <span>Somando as 3 empresas</span>
          )}
          <span className="hidden sm:inline">· {COMPARE[period]}</span>
        </div>
      </div>

      {showMoney ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr]">
          <section className="rounded-2xl bg-[linear-gradient(135deg,#121315_0%,#1d1b17_70%,#2a2418_100%)] p-6 text-[#fff] shadow-prime-card sm:col-span-2 xl:col-span-1">
            <p className="text-sm font-medium text-[#C8C3B8]">Faturamento</p>
            <p className="mt-2 text-[38px] font-semibold leading-none tracking-tight">{money(s?.revenue)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#B5B0A6]">
              <Delta v={data?.change.revenue} />
              <span>{s?.completed ?? 0} corridas finalizadas</span>
            </div>
            <Sparkline values={series.map((p) => p.revenue)} />
          </section>
          <Kpi label="Lucro" value={money(s?.profit)} delta={data?.change.profit} hint={margin != null ? `margem de ${margin}%` : "faturamento − motoristas"} />
          <Kpi label="Corridas" value={String(s?.total ?? "—")} delta={data?.change.total} hint={s ? `${s.completionRate}% concluídas` : ""} />
          <Kpi label="Ticket médio" value={money(s?.avgTicket)} hint="por corrida finalizada" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi label="Corridas" value={String(s?.total ?? "—")} delta={data?.change.total} hint={s ? `${s.completionRate}% concluídas` : ""} />
          <Kpi label="Finalizadas" value={String(s?.completed ?? "—")} />
          <Kpi label="Canceladas" value={String(s?.cancelled ?? "—")} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHead
            title={showMoney ? "Faturamento e lucro" : "Corridas"}
            sub={CHART_TITLE[period]}
            right={
              showMoney ? (
                <div className="flex gap-4 text-sm text-[#4A4D55]">
                  <span className="flex items-center gap-1.5">
                    <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#1A1B1E]" />
                    Faturamento
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#C9A84C]" />
                    Lucro
                  </span>
                </div>
              ) : null
            }
          />
          <div className="px-4 pb-4">{series.length ? <RevenueChart points={series} showMoney={showMoney} /> : <div className="h-72 animate-pulse rounded-xl bg-prime-bg" />}</div>
        </Card>

        <Card>
          <CardHead
            title="Próximas corridas"
            sub="Hoje e amanhã"
            right={
              <Link href={"/agenda" as Route} className="text-sm font-semibold text-prime-gold-ink hover:underline">
                Ver agenda →
              </Link>
            }
          />
          {next.length === 0 ? (
            <p className="px-6 pb-6 pt-2 text-sm text-prime-muted">Nada agendado até amanhã.</p>
          ) : (
            <ul className="px-2 pb-3">
              {next.map((t) => {
                const g = BOOKING_GROUPS.find((x) => x.id === bookingGroupOf(t.operational_status))!;
                return (
                  <li key={t.id}>
                    <Link href={`/agenda?trip=${t.id}#trip-detail` as Route} className="grid grid-cols-[58px_4px_1fr_auto] items-center gap-3 rounded-xl px-4 py-3 hover:bg-prime-bg">
                      <span>
                        <span className="block text-lg font-semibold leading-tight tracking-tight">{formatBrTime(t.scheduled_at)}</span>
                        <span className="block text-xs text-prime-muted">{dayLabel(t.scheduled_at)}</span>
                      </span>
                      <span className="h-9 w-1 rounded-full" style={{ background: g.color }} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">
                          {t.client_name ?? "Cliente"} · {t.passenger_name?.trim() || "passageiro a definir"}
                        </span>
                        <span className="block truncate text-sm text-prime-muted">
                          {shortAddress(t.origin_text)} → {shortAddress(t.destination_text)}
                        </span>
                      </span>
                      {t.driver_name ? (
                        <span className="hidden max-w-[8rem] truncate rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:block">
                          {t.driver_name.split(" ")[0]}
                        </span>
                      ) : (
                        <span className="hidden rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 sm:block">Sem motorista</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHead title="Clientes que mais rodaram" sub={showMoney ? "Por faturamento no período" : "Por corridas no período"} />
          {data?.topClients.length ? (
            <ul className="space-y-4 px-6 pb-6 pt-3">
              {data.topClients.map((c) => (
                <li key={c.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-semibold">{c.name}</span>
                    <span className="shrink-0 text-sm text-prime-muted">
                      {c.trips} corr.{showMoney && c.revenue ? ` · ${money(c.revenue)}` : ""}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F1EFEA]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#C9A84C] to-[#B8913A]" style={{ width: `${Math.max(4, ((c.revenue ?? c.trips) / topRevenue) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 pb-6 pt-2 text-sm text-prime-muted">Sem corridas no período.</p>
          )}
        </Card>
        <Card>
          <CardHead title="Motoristas que mais rodaram" sub="Corridas no período" />
          {data?.topDrivers.length ? (
            <ul className="space-y-4 px-6 pb-6 pt-3">
              {data.topDrivers.map((d) => (
                <li key={d.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-semibold">{d.name}</span>
                    <span className="shrink-0 text-sm text-prime-muted">{d.trips} corridas</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F1EFEA]">
                    <div className="h-full rounded-full bg-[#1A1B1E]" style={{ width: `${Math.max(4, (d.trips / topTrips) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 pb-6 pt-2 text-sm text-prime-muted">Sem corridas no período.</p>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHead
            title="Operação"
            sub={`Situação · ${PERIOD_SHORT[period].toLowerCase()}`}
            right={
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                ao vivo
              </span>
            }
          />
          <p className="px-6 pb-5 pt-1 text-[44px] font-semibold leading-none tracking-tight">
            {s?.active ?? "—"}
            <span className="ml-3 align-middle text-[15px] font-medium tracking-normal text-prime-muted">em andamento agora</span>
          </p>
          <div className="grid grid-cols-2 gap-px border-t border-prime-border bg-prime-border">
            {[
              [String(data?.activeDrivers ?? "—"), "motoristas ativos"],
              [s ? `${s.completionRate}%` : "—", "taxa de conclusão"],
              [String(s?.completed ?? "—"), "finalizadas"],
              [String(s?.cancelled ?? "—"), "canceladas"]
            ].map(([v, l]) => (
              <div key={l} className="bg-white px-6 py-4">
                <p className="text-2xl font-semibold tracking-tight">{v}</p>
                <p className="text-sm text-prime-muted">{l}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, delta, hint }: { label: string; value: string; delta?: number | null; hint?: string }) {
  return (
    <section className="rounded-2xl border border-prime-border bg-white p-6 shadow-prime-card">
      <p className="text-sm font-medium text-prime-muted">{label}</p>
      <p className="mt-2 text-[32px] font-semibold leading-none tracking-tight text-prime-text">{value}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-prime-muted">
        {delta !== undefined ? <Delta v={delta} /> : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </section>
  );
}
