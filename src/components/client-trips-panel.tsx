"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatBrDateTime, scheduledAtSortMs } from "@/lib/dates/br-date";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip } from "@/lib/domain/types";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { clientMayCancelTrip } from "@/lib/domain/status";
import { shortAddress } from "@/lib/client/short-address";
import {
  CLIENT_STATUS,
  CLIENT_STATUS_TONE_CLASS,
  isUpcomingForClient,
  tripShortNumber
} from "@/lib/client/client-status";

type TripRow = Trip & { driver_name?: string | null; vehicle_label?: string | null };

type Props = {
  tenantId: string;
  readOnly?: boolean;
  clientIdOverride?: string;
  devFallbackRole?: "cliente" | "admin";
  /** Mostra o valor das corridas concluídas (gestor). */
  showAmounts?: boolean;
  /** Versão enxuta (funcionário): só próximas, sem abas. */
  compact?: boolean;
  title?: string;
  /** Muda quando uma corrida nova é pedida, para recarregar. */
  reloadKey?: number;
};

function brl(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;
}

export function ClientTripsPanel({
  tenantId,
  readOnly = false,
  clientIdOverride,
  devFallbackRole = "cliente",
  showAmounts = false,
  compact = false,
  title,
  reloadKey = 0
}: Props) {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setLoadError(null);
      const params = new URLSearchParams({ page: "1", pageSize: "100", sortDir: "desc" });
      if (clientIdOverride) params.set("clientId", clientIdOverride);
      const res = await fetchWithSupabaseSession(`/api/trips?${params}`, {}, devFallbackRole);
      const json = (await res.json()) as {
        success?: boolean;
        data?: { items: TripRow[]; total: number };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        setTrips([]);
        setLoadError(json.error?.message ?? "Não foi possível carregar as corridas.");
        setLoading(false);
        return;
      }
      setTrips(json.data?.items ?? []);
      setLoading(false);
    },
    [clientIdOverride, devFallbackRole]
  );

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useTenantTableRefresh(tenantId, ["trips"], load);

  async function cancelTrip(tripId: string) {
    if (!window.confirm("Cancelar este pedido de corrida?")) return;
    setCancellingId(tripId);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/status`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_status: "cancelled" }) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setCancellingId(null);
    if (!res.ok || !json.success) {
      window.alert(json.error?.message ?? "Não foi possível cancelar.");
      return;
    }
    await load({ silent: true });
  }

  const { upcoming, history } = useMemo(() => {
    const now = new Date();
    const up: TripRow[] = [];
    const hist: TripRow[] = [];
    for (const t of trips) {
      (isUpcomingForClient(t.operational_status, t.scheduled_at, now) ? up : hist).push(t);
    }
    up.sort((a, b) => scheduledAtSortMs(a.scheduled_at) - scheduledAtSortMs(b.scheduled_at));
    hist.sort((a, b) => scheduledAtSortMs(b.scheduled_at) - scheduledAtSortMs(a.scheduled_at));
    return { upcoming: up, history: hist };
  }, [trips]);

  const visible = compact || tab === "upcoming" ? upcoming : history;

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-prime-display text-xl text-prime-text">{title ?? "Corridas"}</h2>
        {!compact ? (
          <div className="inline-flex rounded-lg border border-prime-border bg-white p-0.5 text-sm">
            {(
              [
                ["upcoming", `Próximas (${upcoming.length})`],
                ["history", `Histórico (${history.length})`]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-md px-3 py-1.5 ${tab === id ? "bg-[#111] font-medium text-white" : "text-prime-muted hover:text-prime-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError}{" "}
          <button type="button" onClick={() => void load()} className="underline">
            Tentar de novo
          </button>
        </div>
      ) : loading && trips.length === 0 ? (
        <div className="h-28 animate-pulse rounded-2xl border border-prime-border bg-white" />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-prime-border bg-white p-6 text-center text-sm text-prime-muted">
          {compact || tab === "upcoming" ? "Nenhuma corrida agendada." : "Nenhuma corrida no histórico ainda."}
        </div>
      ) : (
        <ul className="grid gap-3">
          {visible.map((trip) => {
            const st = CLIENT_STATUS[trip.operational_status] ?? { label: trip.operational_status, tone: "done" as const };
            const amount = showAmounts && trip.operational_status === "completed" ? brl(trip.client_amount) : null;
            const canCancel = !readOnly && clientMayCancelTrip(trip.operational_status, trip.scheduled_at);
            return (
              <li key={trip.id} className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold text-prime-text">{formatBrDateTime(trip.scheduled_at)}</p>
                    <p className="text-xs text-prime-muted">
                      Nº {tripShortNumber(trip.id)} ·{" "}
                      {trip.service_type ? primeServiceTypeLabel(trip.service_type, { audience: "client" }) : "Serviço"}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${CLIENT_STATUS_TONE_CLASS[st.tone]}`}>
                    {st.label}
                  </span>
                </div>

                <div className="mt-3 grid gap-1.5 text-sm">
                  <p className="flex gap-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-prime-gold" aria-hidden />
                    <span className="text-prime-text">{shortAddress(trip.origin_text)}</span>
                  </p>
                  <p className="flex gap-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-2 border-[#111]" aria-hidden />
                    <span className="text-prime-text">{shortAddress(trip.destination_text)}</span>
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-prime-border pt-3 text-sm">
                  <p className="text-prime-muted">
                    {trip.passenger_name?.trim() || "Passageiro a definir"}
                    {trip.passenger_count != null && trip.passenger_count > 1 ? ` · ${trip.passenger_count} pessoas` : ""}
                    {trip.driver_name ? <span className="text-prime-text"> · Motorista: {trip.driver_name}</span> : null}
                  </p>
                  <div className="flex items-center gap-3">
                    {amount ? <span className="font-semibold text-prime-text">{amount}</span> : null}
                    <Link href={`/client/viagens/${trip.id}`} className="font-medium text-prime-gold hover:underline">
                      Detalhes
                    </Link>
                    <Link href={`/voucher/${trip.id}`} className="font-medium text-prime-gold hover:underline">
                      Voucher
                    </Link>
                    {canCancel ? (
                      <button
                        type="button"
                        disabled={cancellingId === trip.id}
                        onClick={() => void cancelTrip(trip.id)}
                        className="text-red-700 hover:underline disabled:opacity-50"
                      >
                        {cancellingId === trip.id ? "Cancelando…" : "Cancelar"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
