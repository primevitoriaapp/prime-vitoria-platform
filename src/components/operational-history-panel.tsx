"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";
import type { TripOperationalStatus } from "@/lib/domain/types";

type HistoryRow = {
  id: string;
  scheduled_at: string;
  operational_status: TripOperationalStatus;
  origin_text: string;
  destination_text: string;
  passenger_name: string | null;
  planned_km: number | null;
  actual_km: number | null;
  driver_name: string | null;
};

type Props = {
  devFallbackRole?: "operador" | "admin";
  days?: number;
};

export function OperationalHistoryPanel({ devFallbackRole = "operador", days = 14 }: Props) {
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | TripOperationalStatus>("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: "1", pageSize: "40", days: String(days) });
    if (statusFilter) qs.set("status", statusFilter);
    const res = await fetchWithSupabaseSession(`/api/operations/history?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: HistoryRow[] };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setMessage(json.error?.message ?? "Histórico indisponível.");
      setLoading(false);
      return;
    }
    setItems(json.data?.items ?? []);
    setMessage(null);
    setLoading(false);
  }, [days, devFallbackRole, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Histórico operacional ({days} dias)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | TripOperationalStatus)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos encerrados</option>
            <option value="completed">Concluídas</option>
            <option value="cancelled">Canceladas</option>
            <option value="no_show">No-show</option>
            <option value="rejected">Rejeitadas</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-sm text-amber-800">
            Actualizar
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-red-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sem viagens encerradas no período.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-medium text-slate-900">
                  {new Date(row.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="ml-2 text-slate-600">{STATUS_CORRIDA_PT[row.operational_status]}</span>
                {row.driver_name ? <span className="ml-2 text-xs text-slate-500">· {row.driver_name}</span> : null}
                <p className="text-xs text-slate-500">
                  {row.origin_text} → {row.destination_text}
                  {row.actual_km != null ? ` · ${row.actual_km} km` : row.planned_km != null ? ` · ${row.planned_km} km plan.` : ""}
                </p>
              </div>
              <Link href={`/agenda?trip=${row.id}`} className="text-sm font-medium text-amber-700 hover:underline">
                Detalhe
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
