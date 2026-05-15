"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type ReceivableRow = {
  id: string;
  trip_id: string;
  client_id: string;
  amount: number;
  due_date: string;
  status: string;
};

type Props = {
  tenantId: string | null;
  devFallbackRole?: "financeiro" | "operador" | "admin";
};

export function ReceivablesPanel({ tenantId, devFallbackRole = "financeiro" }: Props) {
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "paid" | "cancelled">("open");
  const [items, setItems] = useState<ReceivableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "40" });
    if (statusFilter) qs.set("status", statusFilter);

    const res = await fetchWithSupabaseSession(`/api/finance/receivables?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: ReceivableRow[]; total: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setTotal(0);
      setMessage(json.error?.message ?? "Não foi possível carregar títulos.");
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

  useTenantTableRefresh(tenantId, ["accounts_receivable"], load);

  async function postAction(
    receivableId: string,
    path: "mark-paid" | "reopen" | "cancel",
    body: Record<string, unknown> = {}
  ) {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/finance/receivables/${receivableId}/${path}`,
      { method: "POST", body: JSON.stringify(body) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Operação não concluída.");
      return false;
    }
    return true;
  }

  async function markPaid(receivableId: string) {
    if (await postAction(receivableId, "mark-paid", { payment_method: "manual" })) {
      setMessage("Título marcado como pago.");
      await load();
    }
  }

  async function reopen(receivableId: string) {
    if (await postAction(receivableId, "reopen", { reason: "estorno manual" })) {
      setMessage("Baixa revertida — título em aberto.");
      await load();
    }
  }

  async function cancelReceivable(receivableId: string) {
    if (await postAction(receivableId, "cancel", { reason: "cancelamento manual" })) {
      setMessage("Título cancelado.");
      await load();
    }
  }

  async function enqueueErp(provider: "omie" | "conta_azul", receivableId: string) {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      "/api/integrations/jobs",
      {
        method: "POST",
        body: JSON.stringify({ provider, entity_type: "receivable", entity_id: receivableId })
      },
      devFallbackRole === "financeiro" ? "financeiro" : "operador"
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { job_id: string; deduplicated?: boolean };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao enfileirar sync ERP.");
      return;
    }
    setMessage(
      json.data?.deduplicated
        ? `Job ERP já em fila (${provider}).`
        : `Sync ${provider} enfileirado (job ${json.data?.job_id?.slice(0, 8)}…).`
    );
  }

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Títulos a receber</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="open">Em aberto</option>
            <option value="paid">Pagos</option>
            <option value="cancelled">Cancelados</option>
            <option value="">Todos</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
            Actualizar
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
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
                <th className="py-2 pr-2">Corrida</th>
                <th className="py-2">Acções</th>
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
                  <td className="py-2 pr-2 font-mono text-xs">{row.trip_id.slice(0, 8)}…</td>
                  <td className="py-2">
                    {row.status === "open" ? (
                      <>
                        <button
                          type="button"
                          className="mr-2 text-xs font-medium text-emerald-800"
                          onClick={() => void markPaid(row.id)}
                        >
                          Marcar pago
                        </button>
                        <button
                          type="button"
                          className="mr-2 text-xs text-slate-600"
                          onClick={() => void cancelReceivable(row.id)}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : null}
                    {row.status === "paid" ? (
                      <button
                        type="button"
                        className="mr-2 text-xs font-medium text-amber-800"
                        onClick={() => void reopen(row.id)}
                      >
                        Estornar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="mr-1 text-xs text-amber-800"
                      onClick={() => void enqueueErp("omie", row.id)}
                    >
                      Omie
                    </button>
                    <button
                      type="button"
                      className="text-xs text-amber-800"
                      onClick={() => void enqueueErp("conta_azul", row.id)}
                    >
                      CA
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
