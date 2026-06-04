"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { TripTrackingLinkButton } from "@/components/trip-tracking-link-button";
import { StatusBadge } from "@/components/status-badge";
import { ClientPassengersPanel } from "@/components/client-passengers-panel";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { clientShowsAwaitingApproval } from "@/lib/client/trip-status-ui";
import { clientMayCancelTrip } from "@/lib/domain/status";

const EM_ANDAMENTO: TripOperationalStatus[] = [
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress"
];

type CostCenter = { id: string; code: string | null; name: string };

type Props = {
  tenantId: string;
  costCenters?: CostCenter[];
  readOnly?: boolean;
  clientIdOverride?: string;
  devFallbackRole?: "cliente" | "admin";
};

function inicioMesUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function ClientTripsPanel({
  tenantId,
  costCenters = [],
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
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
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
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    if (filter === "active") {
      return sorted.filter((t) => EM_ANDAMENTO.includes(t.operational_status));
    }
    return sorted;
  }, [trips, filter]);

  const porCentro = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trips) {
      if (t.cost_center_id) {
        m.set(t.cost_center_id, (m.get(t.cost_center_id) ?? 0) + 1);
      }
    }
    return m;
  }, [trips]);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={loading}>
        {loading && trips.length === 0 ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="h-3 w-24 rounded bg-slate-700" />
                <div className="mt-3 h-8 w-16 rounded bg-slate-700" />
              </div>
            ))}
          </>
        ) : (
          <>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Corridas (mês)</p>
          <p className="mt-1 font-serif text-3xl text-amber-400">{corridasMes}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Em andamento</p>
          <p className="mt-1 font-serif text-3xl text-amber-400">{emAndamento}</p>
        </div>
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-200/70">Aguarda aprovação</p>
          <p className="mt-1 font-serif text-3xl text-amber-400">{aguardandoAprovacao}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Centros de custo</p>
          <p className="mt-1 font-serif text-3xl text-amber-400">{costCenters.length}</p>
        </div>
          </>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <section id="corridas" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-serif text-xl text-white">
              Minhas corridas
              {total > 0 ? <span className="ml-2 text-sm font-normal text-slate-500">({total})</span> : null}
            </h2>
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-lg px-3 py-1 ${filter === "all" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFilter("active")}
                className={`rounded-lg px-3 py-1 ${filter === "active" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
              >
                Em andamento
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-slate-700 px-3 py-1 text-slate-400 hover:text-white disabled:opacity-50"
              >
                Actualizar
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            {loadError ? (
              <div className="space-y-3 p-6">
                <p className="text-sm text-red-300">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-lg border border-amber-600/50 bg-amber-950/30 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-900/40"
                >
                  Tentar novamente
                </button>
              </div>
            ) : loading && visible.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">A carregar corridas…</p>
            ) : visible.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">
                {filter === "active"
                  ? "Nenhuma corrida em andamento."
                  : readOnly
                    ? "Nenhuma corrida no histórico."
                    : "Nenhuma corrida. Faça uma solicitação abaixo."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {visible.map((trip) => (
                  <li
                    key={trip.id}
                    className="flex flex-col gap-2 p-4 hover:bg-slate-900/40 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={trip.operational_status} />
                        <span className="font-mono text-xs text-amber-500/90">{trip.id.slice(0, 8)}…</span>
                        {clientShowsAwaitingApproval(trip.operational_status) ? (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                            Aguarda aprovação
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium text-white">
                        {trip.passenger_name?.trim() || "Passageiro a definir"}
                        {trip.service_type ? (
                          <span className="font-normal text-slate-500"> · {trip.service_type}</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-slate-400">
                        {trip.origin_text} → {trip.destination_text}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(trip.scheduled_at).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short"
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 pt-1 sm:items-end sm:pt-0">
                      <Link
                        href={`/client/viagens/${trip.id}`}
                        className="rounded-lg border border-amber-600/50 bg-amber-950/30 px-3 py-2 text-center text-xs font-medium text-amber-200 hover:bg-amber-900/40"
                      >
                        Ver detalhe
                      </Link>
                      {!readOnly ? (
                        <TripTrackingLinkButton tripId={trip.id} variant="dark" devFallbackRole={devFallbackRole} />
                      ) : null}
                      {!readOnly && clientMayCancelTrip(trip.operational_status) ? (
                        <button
                          type="button"
                          disabled={cancellingId === trip.id}
                          onClick={() => void cancelTrip(trip.id)}
                          className="rounded-lg border border-red-900/60 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
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

        <aside id="centros" className="space-y-4">
          <h2 className="font-serif text-lg text-white">Centros de custo</h2>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            {costCenters.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum centro de custo cadastrado.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {costCenters.map((cc) => (
                  <li
                    key={cc.id}
                    className="flex justify-between gap-2 border-b border-slate-800/80 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="truncate text-slate-300">
                      {cc.code ? `${cc.code} · ` : ""}
                      {cc.name}
                    </span>
                    <span className="shrink-0 text-amber-500/90">{porCentro.get(cc.id) ?? 0}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-slate-600">Lista actualiza em tempo real quando o estado da corrida muda.</p>
        </aside>
      </div>

      <ClientPassengersPanel trips={trips} />
    </>
  );
}
