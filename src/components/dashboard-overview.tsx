"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { formatBrTime } from "@/lib/dates/br-date";
import { shortAddress } from "@/lib/client/short-address";
import { DASH_PERIODS, type DashPeriod } from "@/lib/operations/dashboard-metrics";
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
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Change({ v }: { v: number | null }) {
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-700" : "text-red-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );
}

function Kpi({ label, value, hint, change, strong }: { label: string; value: string; hint?: string; change?: number | null; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-prime-card ${strong ? "border-prime-gold/50 bg-white ring-1 ring-prime-gold/20" : "border-prime-border bg-white"}`}>
      <p className={`text-xs font-medium ${strong ? "text-[#A8873A]" : "text-prime-muted"}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold text-prime-text`}>{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {change !== undefined ? <Change v={change ?? null} /> : null}
        {hint ? <span className={`text-xs text-prime-muted`}>{hint}</span> : null}
      </div>
    </div>
  );
}

const ALERT_TONE = {
  red: "border-red-200 bg-red-50 text-red-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  blue: "border-blue-200 bg-blue-50 text-blue-900"
};

/** Topo do Dashboard: período, indicadores, alertas, próximas corridas e rankings. */
export function DashboardOverview({ tenantId, showMoney }: { tenantId: string | null; showMoney: boolean }) {
  const [period, setPeriod] = useState<DashPeriod>("hoje");
  const [data, setData] = useState<Data | null>(null);
  const [next, setNext] = useState<NextTrip[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession(`/api/reports/dashboard?period=${period}`, {}, "admin");
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
      setNext(
        (j2.data?.items ?? [])
          .filter((t) => ["agendada", "atribuida", "em_rota"].includes(bookingGroupOf(t.operational_status)))
          .slice(0, 6)
      );
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips"], load);

  const s = data?.summary;

  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap rounded-xl border border-prime-border bg-white p-1 text-sm">
        {DASH_PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`rounded-lg px-3 py-1.5 ${period === p.id ? "bg-[#111] font-semibold text-[#fff]" : "text-prime-muted hover:text-prime-text"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      {data && data.alerts.length > 0 ? (
        <div className="grid gap-2">
          {data.alerts.map((a) => (
            <Link key={a.text} href={a.href as Route} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium ${ALERT_TONE[a.tone]}`}>
              <span>⚠ {a.text}</span>
              <span>Ver →</span>
            </Link>
          ))}
        </div>
      ) : null}

      {showMoney ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi strong label="Faturamento" value={money(s?.revenue)} change={data?.change.revenue} hint="corridas finalizadas" />
          <Kpi label="Pago a motoristas" value={money(s?.payout)} hint="parceiros" />
          <Kpi label="Lucro" value={money(s?.profit)} change={data?.change.profit} />
          <Kpi label="Ticket médio" value={money(s?.avgTicket)} hint="por corrida" />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Corridas" value={String(s?.total ?? "—")} change={data?.change.total} />
        <Kpi label="Em andamento agora" value={String(s?.active ?? "—")} />
        <Kpi label="Finalizadas" value={String(s?.completed ?? "—")} />
        <Kpi label="Canceladas" value={String(s?.cancelled ?? "—")} />
        <Kpi label="Taxa de conclusão" value={s ? `${s.completionRate}%` : "—"} />
        <Kpi label="Motoristas ativos" value={String(data?.activeDrivers ?? "—")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Próximas corridas</h2>
            <Link href={"/agenda" as Route} className="text-sm font-medium text-prime-gold hover:underline">
              Ver todas →
            </Link>
          </div>
          {next.length === 0 ? (
            <p className="mt-4 text-sm text-prime-muted">Nada agendado até amanhã.</p>
          ) : (
            <ul className="mt-3 divide-y divide-prime-border">
              {next.map((t) => {
                const g = BOOKING_GROUPS.find((x) => x.id === bookingGroupOf(t.operational_status))!;
                return (
                  <li key={t.id}>
                    <Link href={`/agenda?trip=${t.id}#trip-detail` as Route} className="flex items-center gap-3 py-2.5 hover:bg-prime-bg">
                      <span className="w-14 shrink-0 text-lg font-semibold">{formatBrTime(t.scheduled_at)}</span>
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: g.color }} />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate font-medium">
                          {t.client_name ?? "Cliente"} · {t.passenger_name?.trim() || "passageiro a definir"}
                        </span>
                        <span className="block truncate text-prime-muted">
                          {shortAddress(t.origin_text)} → {shortAddress(t.destination_text)}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right text-xs sm:block">
                        {t.driver_name ?? <span className="font-semibold text-red-700">Sem motorista</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid gap-4">
          <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
            <h2 className="text-base font-semibold">Clientes que mais rodaram</h2>
            {data?.topClients.length ? (
              <ol className="mt-3 space-y-2 text-sm">
                {data.topClients.map((c, i) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <b className="text-prime-gold">{i + 1}.</b> {c.name}
                    </span>
                    <span className="shrink-0 text-prime-muted">
                      {c.trips} corr.{showMoney && c.revenue ? ` · ${money(c.revenue)}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-prime-muted">Sem corridas no período.</p>
            )}
          </section>
          <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
            <h2 className="text-base font-semibold">Motoristas que mais rodaram</h2>
            {data?.topDrivers.length ? (
              <ol className="mt-3 space-y-2 text-sm">
                {data.topDrivers.map((d, i) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <b className="text-prime-gold">{i + 1}.</b> {d.name}
                    </span>
                    <span className="shrink-0 text-prime-muted">{d.trips} corr.</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-prime-muted">Sem corridas no período.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
