"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type JobRow = {
  id: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  correlation_id: string;
  created_at: string;
  payload: Record<string, unknown>;
};

type Props = {
  tenantId?: string | null;
  devFallbackRole?: "operador" | "admin";
};

export function NotificationJobsPanel({ tenantId = null, devFallbackRole = "operador" }: Props) {
  const [statusFilter, setStatusFilter] = useState<"queued" | "error" | "success" | "">("queued");
  const [items, setItems] = useState<JobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "30" });
    if (statusFilter) qs.set("status", statusFilter);

    const res = await fetchWithSupabaseSession(`/api/jobs/notifications?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: JobRow[]; total: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setTotal(0);
      setMessage(json.error?.message ?? "Não foi possível carregar a fila.");
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

  useTenantTableRefresh(tenantId, ["notification_jobs"], load);

  async function onProcess() {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      "/api/jobs/notifications/process?limit=30",
      { method: "POST" },
      devFallbackRole
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { processed: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao processar fila.");
      return;
    }
    setMessage(`Processados: ${json.data?.processed ?? 0} job(s).`);
    await load();
  }

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Fila de notificações push</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="queued">Em fila</option>
            <option value="error">Erro</option>
            <option value="success">Enviados</option>
            <option value="">Todos</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
            Actualizar
          </button>
          <button type="button" onClick={() => void onProcess()} className="text-sm font-medium text-amber-800">
            Processar fila (FCM)
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Requer <code>FCM_SERVER_KEY</code> no servidor. Motoristas precisam de token em{" "}
        <code>POST /api/drivers/push-token</code>.
      </p>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nenhum job ({total} no total).</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-2">Quando</th>
                <th className="py-2 pr-2">Evento</th>
                <th className="py-2 pr-2">Destinatário</th>
                <th className="py-2 pr-2">Estado</th>
                <th className="py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const payload = row.payload ?? {};
                const eventType = String(payload.eventType ?? "—");
                const channel = String(payload.channel ?? "push");
                const recipientType = String(payload.recipientType ?? "—");
                const recipientId = String(payload.recipientId ?? "—");
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-mono text-xs text-slate-500">
                      {new Date(row.created_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short"
                      })}
                    </td>
                    <td className="py-2 pr-2">
                      {eventType}
                      <span className="text-slate-400"> · {channel}</span>
                    </td>
                    <td className="max-w-[120px] truncate py-2 pr-2 font-mono text-xs" title={`${recipientType}:${recipientId}`}>
                      {recipientType.slice(0, 3)}:{recipientId.slice(0, 6)}…
                    </td>
                    <td className="py-2 pr-2">
                      <span
                        className={
                          row.status === "success"
                            ? "text-green-700"
                            : row.status === "error"
                              ? "text-red-700"
                              : "text-amber-700"
                        }
                      >
                        {row.status}
                        {row.attempt_count > 0 ? ` (${row.attempt_count})` : ""}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate py-2 text-xs text-red-600" title={row.last_error ?? ""}>
                      {row.last_error ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
