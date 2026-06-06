"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { TripTrackingLinkButton } from "@/components/trip-tracking-link-button";
import { StatusBadge } from "@/components/status-badge";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { clientShowsAwaitingApproval } from "@/lib/client/trip-status-ui";
import { clientMayCancelTrip } from "@/lib/domain/status";
import { PRIME_SURFACE_CARD } from "@/lib/ui/prime-surface-card";

const EM_ANDAMENTO: TripOperationalStatus[] = [
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress"
];

type Props = {
  tenantId: string;
  readOnly?: boolean;
  clientIdOverride?: string;
  devFallbackRole?: "cliente" | "admin";
};

function inicioMesUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function ClientTripsPanel({
  tenantId,
  readOnly = false,
  clientIdOverride,
  devFallbackRole = "cliente"
}: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: "1", pageSize: "100", sortDir: "desc" });
    if (clientIdOverride) params.set("clientId", clientIdOverride);
    const res = await fetchWithSupabaseSession(`/api/trips?${params}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: Trip[]; total: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setTrips([]);
      setTotal(0);
      setLoadError(json.error?.message ?? "Não foi possível carregar as corridas. Verifique a sessão.");
      setLoading(false);
      return;
    }
    setTrips(json.data?.items ?? []);
    setTotal(json.data?.total ?? 0);
    setLoading(false);
  }, [clientIdOverride, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips"], load);

  async function cancelTrip(tripId: string) {
    if (!window.confirm("Cancelar esta solicitação? Esta acção não pode ser desfeita.")) return;
    setCancellingId(tripId);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_status: "cancelled" })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setCancellingId(null);
    if (!res.ok || !json.success) {
      window.alert(json.error?.message ?? "Não foi possível cancelar.");
      return;
    }
    await load();
  }

  const agora = new Date();
  const mesIni = inicioMesUtc(agora);
  const corridasMes = trips.filter((t) => new Date(t.scheduled_at) >= mesIni).length;
  const emAndamento = trips.filter((t) => EM_ANDAMENTO.includes(t.operational_status)).length;
  const aguardandoAprovacao = trips.filter((t) => clientShowsAwaitingApproval(t.operational_status)).length;

  const visible = useMemo(() => {
    const sorted = [...trips].sort(
      (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
    );
    if (filter === "active") {
      return sorted.filter((t) => EM_ANDAMENTO.includes(t.operational_status));
    }
    return sorted;
  }, [trips, filter]);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={loading}>
        {loading && trips.length === 0 ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`animate-pulse ${PRIME_SURFACE_CARD}`}>
                <div className="h-3 w-24 rounded bg-gray-200" />
                <div className="mt-3 h-8 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </>
        ) : (
          <>
        <div className={PRIME_SURFACE_CARD}>
          <p className="text-xs uppercase tracking-wide text-prime-muted">Corridas (mês)</p>
          <p className="mt-1 font-serif text-3xl text-prime-gold">{corridasMes}</p>
        </div>
        <div className={PRIME_SURFACE_CARD}>
          <p className="text-xs uppercase tracking-wide text-prime-muted">Em andamento</p>
          <p className="mt-1 font-serif text-3xl text-prime-gold">{emAndamento}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
          <p className="text-xs uppercase tracking-wide text-amber-900/80">Aguarda aprovação</p>
          <p className="mt-1 font-serif text-3xl text-prime-gold">{aguardandoAprovacao}</p>
        </div>
        <div className={PRIME_SURFACE_CARD}>
          <p className="text-xs uppercase tracking-wide text-prime-muted">Total no histórico</p>
          <p className="mt-1 font-serif text-3xl text-prime-gold">{total}</p>
        </div>
          </>
        )}
      </section>

      <section id="corridas" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-serif text-xl text-prime-text">
              Minhas corridas
              {total > 0 ? <span className="ml-2 text-sm font-normal text-prime-muted">({total})</span> : null}
            </h2>
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-lg px-3 py-1 ${filter === "all" ? "bg-prime-gold font-medium text-prime-text" : "text-prime-muted hover:text-prime-text"}`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFilter("active")}
                className={`rounded-lg px-3 py-1 ${filter === "active" ? "bg-prime-gold font-medium text-prime-text" : "text-prime-muted hover:text-prime-text"}`}
              >
                Em andamento
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="btn-outline px-3 py-1 text-sm disabled:opacity-50"
              >
                Actualizar
              </button>
            </div>
          </div>
          <div className={`overflow-hidden ${PRIME_SURFACE_CARD} p-0`}>
            {loadError ? (
              <div className="space-y-3 p-6">
                <p className="text-sm text-red-700">{loadError}</p>
                <button type="button" onClick={() => void load()} className="btn-outline text-sm">
                  Tentar novamente
                </button>
              </div>
            ) : loading && visible.length === 0 ? (
              <p className="p-6 text-sm text-prime-muted">A carregar corridas…</p>
            ) : visible.length === 0 ? (
              <p className="p-6 text-sm text-prime-muted">
                {filter === "active"
                  ? "Nenhuma corrida em andamento."
                  : readOnly
                    ? "Nenhuma corrida no histórico."
                    : "Nenhuma corrida. Faça uma solicitação acima."}
              </p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {visible.map((trip) => (
                  <li
                    key={trip.id}
                    className="flex flex-col gap-2 p-4 hover:bg-gray-50 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={trip.operational_status} />
                        <span className="font-mono text-xs text-prime-gold">{trip.id.slice(0, 8)}…</span>
                        {clientShowsAwaitingApproval(trip.operational_status) ? (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Aguarda aprovação
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium text-prime-text">
                        {trip.passenger_name?.trim() || "Passageiro a definir"}
                        {trip.service_type ? (
                          <span className="font-normal text-prime-muted">
                            {" "}
                            ·{" "}
                            {primeServiceTypeLabel(trip.service_type, { audience: "client" })}
                          </span>
                        ) : null}
                        {trip.passenger_count != null && trip.passenger_count > 1 ? (
                          <span className="font-normal text-prime-muted">
                            {" "}
                            · {trip.passenger_count} passageiros
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-prime-muted">
                        {trip.origin_text} → {trip.destination_text}
                      </p>
                      <p className="text-xs text-prime-muted">{formatBrDateTime(trip.scheduled_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 pt-1 sm:items-end sm:pt-0">
                      <Link
                        href={`/client/viagens/${trip.id}`}
                        className="btn-outline px-3 py-2 text-center text-xs"
                      >
                        Ver detalhe
                      </Link>
                      {!readOnly ? (
                        <TripTrackingLinkButton tripId={trip.id} devFallbackRole={devFallbackRole} />
                      ) : null}
                      {!readOnly && clientMayCancelTrip(trip.operational_status) ? (
                        <button
                          type="button"
                          disabled={cancellingId === trip.id}
                          onClick={() => void cancelTrip(trip.id)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {cancellingId === trip.id ? "A cancelar…" : "Cancelar solicitação"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
      </section>
    </>
  );
}
