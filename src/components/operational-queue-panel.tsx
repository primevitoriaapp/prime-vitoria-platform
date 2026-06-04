"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { buildAgendaTripHref } from "@/lib/operations/agenda-trip-href";

type QueueItem = {
  id: string;
  scheduled_at: string;
  operational_status: TripOperationalStatus;
  passenger_name: string | null;
  origin_text: string;
  destination_text: string;
  claim: { operator_profile_id: string; claimed_at: string; operator_name?: string | null } | null;
};

type ClientRow = { id: string; name: string };

type Horizon = "" | "48h" | "7d";

type Props = {
  tenantId: string | null;
  devFallbackRole?: "operador" | "admin";
};

function horizonParams(h: Horizon): { scheduled_from?: string; scheduled_to?: string } {
  if (!h) return {};
  const from = new Date();
  const to = new Date(from);
  if (h === "48h") to.setHours(to.getHours() + 48);
  if (h === "7d") to.setDate(to.getDate() + 7);
  return { scheduled_from: from.toISOString(), scheduled_to: to.toISOString() };
}

export function OperationalQueuePanel({ tenantId, devFallbackRole = "operador" }: Props) {
  const [unclaimedOnly, setUnclaimedOnly] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>("");
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/clients", {}, devFallbackRole);
      const json = (await res.json()) as { success?: boolean; data?: ClientRow[] };
      if (!cancelled && res.ok && json.success && Array.isArray(json.data)) setClients(json.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [devFallbackRole]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "40" });
    if (unclaimedOnly) qs.set("unclaimedOnly", "true");
    if (clientId) qs.set("client_id", clientId);
    const h = horizonParams(horizon);
    if (h.scheduled_from) qs.set("scheduled_from", h.scheduled_from);
    if (h.scheduled_to) qs.set("scheduled_to", h.scheduled_to);

    const res = await fetchWithSupabaseSession(`/api/operations/queue?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: QueueItem[] };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setMessage(json.error?.message ?? "Fila indisponível.");
      setLoading(false);
      return;
    }
    setItems(json.data?.items ?? []);
    setLoading(false);
  }, [unclaimedOnly, devFallbackRole, clientId, horizon]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips", "trip_operational_claims"], load);

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Fila operacional</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-slate-600">Cliente</span>
            <select
              aria-label="Filtrar por cliente"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="max-w-[10rem] rounded border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.length > 22 ? `${c.name.slice(0, 22)}…` : c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-slate-600">Janela</span>
            <select
              aria-label="Janela de agendamento"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as Horizon)}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Todas</option>
              <option value="48h">Próx. 48 h</option>
              <option value="7d">Próx. 7 dias</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={unclaimedOnly} onChange={(e) => setUnclaimedOnly(e.target.checked)} />
            Só sem atendimento
          </label>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
            Actualizar
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-red-700">{message}</p> : null}
      {loading ? (
        <ul className="mt-3 animate-pulse space-y-2" aria-busy="true" aria-label="A carregar fila">
          {[1, 2, 3].map((i) => (
            <li key={i} className="h-12 rounded bg-slate-100" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhuma viagem activa na fila.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-medium text-slate-900">
                  {formatBrDateTime(row.scheduled_at)}
                </span>
                <span className="ml-2 text-slate-600">{STATUS_CORRIDA_PT[row.operational_status]}</span>
                {row.claim ? (
                  <span className="ml-2 text-xs text-amber-800">
                    · {row.claim.operator_name?.trim() || "em atendimento"}
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-red-700">· sem operador</span>
                )}
                <p className="text-xs text-slate-500">
                  {row.origin_text} → {row.destination_text}
                </p>
              </div>
              <Link
                href={buildAgendaTripHref(row.id, row.scheduled_at) as Route}
                className="text-sm font-medium text-amber-700 hover:underline"
              >
                Abrir na agenda
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
