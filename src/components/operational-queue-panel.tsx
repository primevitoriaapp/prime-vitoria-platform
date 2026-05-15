"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import type { TripOperationalStatus } from "@/lib/domain/types";

type QueueItem = {
  id: string;
  scheduled_at: string;
  operational_status: TripOperationalStatus;
  passenger_name: string | null;
  origin_text: string;
  destination_text: string;
  claim: { operator_profile_id: string; claimed_at: string } | null;
};

type Props = {
  tenantId: string | null;
  devFallbackRole?: "operador" | "admin";
};

export function OperationalQueuePanel({ tenantId, devFallbackRole = "operador" }: Props) {
  const [unclaimedOnly, setUnclaimedOnly] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "40" });
    if (unclaimedOnly) qs.set("unclaimedOnly", "true");

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
  }, [unclaimedOnly, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips", "trip_operational_claims"], load);

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Fila operacional</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={unclaimedOnly} onChange={(e) => setUnclaimedOnly(e.target.checked)} />
          Só sem atendimento
        </label>
        <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
          Actualizar
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-red-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhuma viagem activa na fila.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-medium text-slate-900">
                  {new Date(row.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="ml-2 text-slate-600">{STATUS_CORRIDA_PT[row.operational_status]}</span>
                {row.claim ? (
                  <span className="ml-2 text-xs text-amber-800">· em atendimento</span>
                ) : (
                  <span className="ml-2 text-xs text-red-700">· sem operador</span>
                )}
                <p className="text-xs text-slate-500">
                  {row.origin_text} → {row.destination_text}
                </p>
              </div>
              <Link href={`/agenda?trip=${row.id}`} className="text-sm font-medium text-amber-700 hover:underline">
                Abrir
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
