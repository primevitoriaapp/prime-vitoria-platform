"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { formatBrTime } from "@/lib/dates/br-date";
import { shortAddress } from "@/lib/client/short-address";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import {
  BOOKING_GROUPS,
  BOOKING_PERIODS,
  STATUS_LABEL,
  bookingGroupOf,
  bookingPeriodRange,
  type BookingGroup,
  type BookingPeriod
} from "@/lib/operations/booking-periods";

type Trip = {
  id: string;
  scheduled_at: string;
  operational_status: string;
  origin_text: string;
  destination_text: string;
  passenger_name?: string | null;
  passenger_count?: number | null;
  client_name?: string | null;
  driver_name?: string | null;
  vehicle?: { model?: string | null; plate?: string | null } | null;
  client_amount?: number | null;
  driver_amount?: number | null;
  flight_number?: string | null;
};

type Props = { tenantId: string | null };

function brl(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
}

/** Tela Agendamentos: corridas do período, contadores por situação, busca e lista legível. */
export function BookingsBoard({ tenantId }: Props) {
  const [period, setPeriod] = useState<BookingPeriod>("hoje");
  const [group, setGroup] = useState<BookingGroup | "todas">("todas");
  const [search, setSearch] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { from, to } = bookingPeriodRange(period);
    const qs = new URLSearchParams({ scheduledFrom: from, scheduledTo: to, pageSize: "300", sortDir: "asc" });
    const res = await fetchWithSupabaseSession(`/api/trips?${qs}`, {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { items: Trip[] }; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setError(json.error?.message ?? "Não foi possível carregar as corridas.");
      setTrips([]);
    } else {
      setError(null);
      setTrips(json.data?.items ?? []);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips"], load);

  const counts = useMemo(() => {
    const c: Record<BookingGroup, number> = { agendada: 0, atribuida: 0, em_rota: 0, finalizada: 0, cancelada: 0 };
    for (const t of trips) c[bookingGroupOf(t.operational_status)] += 1;
    return c;
  }, [trips]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips.filter((t) => {
      if (group !== "todas" && bookingGroupOf(t.operational_status) !== group) return false;
      if (!q) return true;
      return [t.id.slice(0, 8), t.passenger_name, t.client_name, t.driver_name, t.origin_text, t.destination_text, t.flight_number, t.vehicle?.plate]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [trips, group, search]);

  const multiDay = period === "semana" || period === "mes";
  let lastDay = "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-xl border border-prime-border bg-white p-1 text-sm">
          {BOOKING_PERIODS.map((p) => (
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
        <Link href={"/agenda" as Route} className="btn-primary ml-auto">
          + Agendar viagem
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {BOOKING_GROUPS.map((g) => {
          const active = group === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(active ? "todas" : g.id)}
              className={`rounded-2xl border bg-white p-4 text-left shadow-prime-card transition ${active ? "ring-2" : "hover:border-prime-gold"}`}
              style={{ borderColor: active ? g.color : undefined, ["--tw-ring-color" as string]: g.color }}
            >
              <span className="flex items-center gap-2 text-sm text-prime-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                {g.label}
              </span>
              <span className="mt-1 block text-3xl font-semibold" style={{ color: g.color }}>
                {counts[g.id]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${PRIME_INPUT_CLASS} max-w-md flex-1`}
          placeholder="Buscar passageiro, empresa, motorista, endereço, voo ou placa"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {group !== "todas" || search ? (
          <button
            type="button"
            className="text-sm text-prime-gold hover:underline"
            onClick={() => {
              setGroup("todas");
              setSearch("");
            }}
          >
            Limpar filtros
          </button>
        ) : null}
        <span className="ml-auto text-sm text-prime-muted">{visible.length} corrida(s)</span>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
      ) : loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-prime-border bg-white" />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-prime-border bg-white p-10 text-center">
          <p className="text-base font-medium">Nenhuma corrida aqui.</p>
          <p className="mt-1 text-sm text-prime-muted">Troque o período ou limpe os filtros.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {visible.map((t) => {
            const g = BOOKING_GROUPS.find((x) => x.id === bookingGroupOf(t.operational_status))!;
            const day = multiDay ? dayLabel(t.scheduled_at) : "";
            const showDay = multiDay && day !== lastDay;
            lastDay = day;
            const value = brl(t.client_amount);
            const payout = brl(t.driver_amount);
            return (
              <li key={t.id} className="contents">
                {showDay ? (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-prime-muted">{day}</p>
                ) : null}
                <Link
                  href={`/agenda?trip=${t.id}#trip-detail` as Route}
                  className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card transition hover:border-prime-gold md:grid-cols-[90px_1fr_220px_150px] md:items-center"
                  style={{ borderLeft: `5px solid ${g.color}` }}
                >
                  <div>
                    <p className="text-2xl font-semibold leading-none">{formatBrTime(t.scheduled_at)}</p>
                    <p className="mt-1 text-xs text-prime-muted">Nº {t.id.slice(0, 6).toUpperCase()}</p>
                  </div>

                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="truncate font-semibold">
                      {t.client_name ?? "Cliente"}
                      <span className="font-normal text-prime-muted">
                        {" · "}
                        {t.passenger_name?.trim() || "passageiro a definir"}
                        {t.passenger_count && t.passenger_count > 1 ? ` (+${t.passenger_count - 1})` : ""}
                        {t.flight_number ? ` · voo ${t.flight_number}` : ""}
                      </span>
                    </p>
                    <p className="flex gap-2">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-prime-gold" />
                      <span className="truncate">{shortAddress(t.origin_text)}</span>
                    </p>
                    <p className="flex gap-2">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-2 border-[#111]" />
                      <span className="truncate">{shortAddress(t.destination_text)}</span>
                    </p>
                  </div>

                  <div className="text-sm">
                    <span
                      className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ color: g.color, background: g.bg }}
                    >
                      {STATUS_LABEL[t.operational_status] ?? t.operational_status}
                    </span>
                    <p className="mt-1.5 truncate">{t.driver_name ?? <span className="text-red-700">Sem motorista</span>}</p>
                    {t.vehicle?.plate ? (
                      <p className="truncate text-xs text-prime-muted">
                        {t.vehicle.model} · {t.vehicle.plate}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-sm md:text-right">
                    {value ? <p className="text-base font-semibold">{value}</p> : <p className="font-semibold text-amber-700">Sem valor</p>}
                    {payout ? <p className="text-xs text-prime-muted">Motorista {payout}</p> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
