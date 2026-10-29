"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { bookingGroupOf, brToday } from "@/lib/operations/booking-periods";

type Trip = { id: string; scheduled_at: string; operational_status: string };
type DayStat = { total: number; noDriver: number; done: number; cancelled: number };

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ymdInSp(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Calendário do mês na Agenda: cada dia mostra quantas corridas tem e quantas estão sem motorista. */
export function AgendaMonthCalendar({
  tenantId,
  selectedDay,
  onPickDay
}: {
  tenantId: string | null;
  selectedDay: string | null;
  onPickDay: (ymd: string) => void;
}) {
  const today = brToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [stats, setStats] = useState<Map<string, DayStat>>(new Map());

  const load = useCallback(async () => {
    const [y, m] = month.split("-").map(Number);
    const from = new Date(`${month}-01T00:00:00-03:00`).toISOString();
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    const to = new Date(new Date(`${next}-01T00:00:00-03:00`).getTime() - 1).toISOString();
    const qs = new URLSearchParams({ scheduledFrom: from, scheduledTo: to, pageSize: "300", sortDir: "asc" });
    const res = await fetchWithSupabaseSession(`/api/trips?${qs}`, {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { items: Trip[] } };
    if (!res.ok || !json.success) return;
    const map = new Map<string, DayStat>();
    for (const t of json.data?.items ?? []) {
      const d = ymdInSp(t.scheduled_at);
      const st = map.get(d) ?? { total: 0, noDriver: 0, done: 0, cancelled: 0 };
      const g = bookingGroupOf(t.operational_status);
      if (g === "cancelada") st.cancelled += 1;
      else {
        st.total += 1;
        if (g === "agendada") st.noDriver += 1;
        if (g === "finalizada") st.done += 1;
      }
      map.set(d, st);
    }
    setStats(map);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips"], load);

  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: (string | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= days; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const monthTotals = useMemo(() => {
    let total = 0;
    let noDriver = 0;
    for (const [d, s] of stats) {
      total += s.total;
      if (d >= today) noDriver += s.noDriver;
    }
    return { total, noDriver };
  }, [stats, today]);

  const label = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className="h-8 w-8 rounded-lg ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => setMonth((v) => shiftMonth(v, -1))}>
            ‹
          </button>
          <h2 className="min-w-[160px] text-center text-base font-semibold capitalize">{label}</h2>
          <button type="button" className="h-8 w-8 rounded-lg ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => setMonth((v) => shiftMonth(v, 1))}>
            ›
          </button>
          {month !== today.slice(0, 7) ? (
            <button type="button" className="text-sm text-prime-gold hover:underline" onClick={() => setMonth(today.slice(0, 7))}>
              Hoje
            </button>
          ) : null}
        </div>
        <p className="text-sm text-prime-muted">
          {monthTotals.total} corrida(s) no mês
          {monthTotals.noDriver ? (
            <span className="font-semibold text-red-700"> · {monthTotals.noDriver} sem motorista daqui pra frente</span>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-prime-muted">
        {WEEK.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const s = stats.get(d);
          const past = d < today;
          const sel = d === selectedDay;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPickDay(d)}
              className={`flex min-h-[64px] flex-col items-start rounded-xl p-1.5 text-left text-xs transition sm:min-h-[76px] sm:p-2 ${
                sel ? "bg-[#111] text-[#fff]" : past ? "bg-prime-bg/60 text-prime-muted hover:bg-prime-bg" : "bg-prime-bg hover:ring-1 hover:ring-prime-gold"
              } ${isToday && !sel ? "ring-2 ring-prime-gold" : ""}`}
            >
              <span className="text-sm font-semibold">{Number(d.slice(8))}</span>
              {s && s.total > 0 ? (
                <span className="mt-auto w-full space-y-0.5">
                  <span className={`block font-semibold ${sel ? "text-prime-gold" : ""}`}>{s.total} corr.</span>
                  {s.noDriver > 0 && !past ? (
                    <span className="block rounded bg-red-600 px-1 text-[10px] font-bold text-[#fff]">{s.noDriver} sem motorista</span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
