"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DateInput } from "@/components/date-input";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { endOfUtcDayIsoFromDateInput } from "@/lib/datetime/end-of-utc-day";
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

type ClientRow = { id: string; name: string };
type DriverRow = { id: string; profile_name?: string | null };

type Props = {
  devFallbackRole?: "operador" | "admin";
  days?: number;
};

const PAGE_SIZE = 20;

export function OperationalHistoryPanel({ devFallbackRole = "operador", days = 14 }: Props) {
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | TripOperationalStatus>("");
  const [clientId, setClientId] = useState("");
  const [driverId, setDriverId] = useState("");
  /** Limite superior de `scheduled_at` (ISO date YYYY-MM-DD, fim do dia UTC). */
  const [untilDate, setUntilDate] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cRes, dRes] = await Promise.all([
        fetchWithSupabaseSession("/api/clients", {}, devFallbackRole),
        fetchWithSupabaseSession("/api/drivers", {}, devFallbackRole)
      ]);
      const cJson = (await cRes.json()) as { success?: boolean; data?: ClientRow[] };
      const dJson = (await dRes.json()) as { success?: boolean; data?: DriverRow[] };
      if (cancelled) return;
      if (cRes.ok && cJson.success && Array.isArray(cJson.data)) setClients(cJson.data);
      if (dRes.ok && dJson.success && Array.isArray(dJson.data)) setDrivers(dJson.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [devFallbackRole]);

  const exportCsv = useCallback(async () => {
    setMessage(null);
    const qs = new URLSearchParams({
      format: "csv",
      days: String(days),
      page: "1",
      pageSize: "500"
    });
    if (statusFilter) qs.set("status", statusFilter);
    if (clientId) qs.set("client_id", clientId);
    if (driverId) qs.set("driver_id", driverId);
    if (untilDate) {
      const end = endOfUtcDayIsoFromDateInput(untilDate);
      if (end) qs.set("scheduled_to", end);
    }
    const res = await fetchWithSupabaseSession(`/api/operations/history?${qs}`, {}, devFallbackRole);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setMessage(json.error?.message ?? "Exportação CSV falhou.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historico-operacional.csv";
    a.rel = "noopener";
    a.click();
    URL.revokeObjectURL(url);
  }, [days, devFallbackRole, statusFilter, clientId, driverId, untilDate]);

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setMessage(null);
      const qs = new URLSearchParams({
        page: String(pageNum),
        pageSize: String(PAGE_SIZE),
        days: String(days)
      });
      if (statusFilter) qs.set("status", statusFilter);
      if (clientId) qs.set("client_id", clientId);
      if (driverId) qs.set("driver_id", driverId);
      if (untilDate) {
        const end = endOfUtcDayIsoFromDateInput(untilDate);
        if (end) qs.set("scheduled_to", end);
      }
      const res = await fetchWithSupabaseSession(`/api/operations/history?${qs}`, {}, devFallbackRole);
      const json = (await res.json()) as {
        success?: boolean;
        data?: { items: HistoryRow[]; total?: number };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        if (!append) setItems([]);
        setMessage(json.error?.message ?? "Histórico indisponível.");
        setTotal(0);
        setPage(1);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const batch = json.data?.items ?? [];
      const t = json.data?.total ?? 0;
      setTotal(t);
      if (append) {
        setItems((prev) => [...prev, ...batch]);
      } else {
        setItems(batch);
      }
      setPage(pageNum);
      setLoading(false);
      setLoadingMore(false);
    },
    [days, devFallbackRole, statusFilter, clientId, driverId, untilDate]
  );

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  const hasMore = items.length > 0 && items.length < total;

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
          <select
            aria-label="Filtrar cliente"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="max-w-[10rem] rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.length > 28 ? `${c.name.slice(0, 28)}…` : c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar motorista"
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="max-w-[10rem] rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos motoristas</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {(d.profile_name ?? d.id.slice(0, 8)).length > 28
                  ? `${(d.profile_name ?? d.id).slice(0, 28)}…`
                  : (d.profile_name ?? `Motorista ${d.id.slice(0, 8)}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Até
            <DateInput
              value={untilDate}
              onChange={setUntilDate}
              className="rounded border border-slate-300 px-1 py-1 text-sm"
            />
          </label>
          <button type="button" onClick={() => void exportCsv()} className="text-sm text-slate-700 hover:underline">
            CSV
          </button>
          <button type="button" onClick={() => void loadPage(1, false)} disabled={loading} className="text-sm text-amber-800">
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
        <>
          <p className="mt-2 text-xs text-slate-500">
            {items.length} de {total} no período
          </p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium text-slate-900">
                    {formatBrDateTime(row.scheduled_at)}
                  </span>
                  <span className="ml-2 text-slate-600">{STATUS_CORRIDA_PT[row.operational_status]}</span>
                  {row.driver_name ? <span className="ml-2 text-xs text-slate-500">· {row.driver_name}</span> : null}
                  <p className="text-xs text-slate-500">
                    {row.origin_text} → {row.destination_text}
                    {row.actual_km != null
                      ? ` · ${row.actual_km} km`
                      : row.planned_km != null
                        ? ` · ${row.planned_km} km plan.`
                        : ""}
                  </p>
                </div>
                <Link href={`/agenda?trip=${row.id}`} className="text-sm font-medium text-amber-700 hover:underline">
                  Detalhe
                </Link>
              </li>
            ))}
          </ul>
          {hasMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadPage(page + 1, true)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? "A carregar…" : "Carregar mais"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
