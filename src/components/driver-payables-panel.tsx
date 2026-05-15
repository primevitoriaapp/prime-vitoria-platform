"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type PayableRow = {
  id: string;
  trip_id: string;
  driver_id: string;
  amount: number;
  due_date: string;
  status: string;
};

type Props = {
  tenantId: string | null;
  devFallbackRole?: "financeiro" | "admin";
};

export function DriverPayablesPanel({ tenantId, devFallbackRole = "financeiro" }: Props) {
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "paid">("open");
  const [items, setItems] = useState<PayableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "40" });
    if (statusFilter) qs.set("status", statusFilter);

    const res = await fetchWithSupabaseSession(`/api/finance/driver-payables?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: PayableRow[]; total: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setTotal(0);
      setMessage(json.error?.message ?? "Não foi possível carregar contas a pagar.");
      setLoading(false);
      return;
    }
    setItems(json.data?.items ?? []);
    setTotal(json.data?.total ?? 0);
    setLoading(false);
  }, [statusFilter, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips"], load);

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Contas a pagar (motoristas)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="open">Em aberto</option>
            <option value="paid">Pagas</option>
            <option value="">Todas</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
            Actualizar
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-red-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sem títulos ({total} no total).</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-2">Vencimento</th>
                <th className="py-2 pr-2">Valor</th>
                <th className="py-2 pr-2">Estado</th>
                <th className="py-2 pr-2">Motorista</th>
                <th className="py-2">Corrida</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2">{row.due_date}</td>
                  <td className="py-2 pr-2">
                    {Number(row.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td className="py-2 pr-2">{row.status}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{row.driver_id.slice(0, 8)}…</td>
                  <td className="py-2 font-mono text-xs">{row.trip_id.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
