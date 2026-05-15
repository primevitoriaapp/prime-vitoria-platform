"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type InboxRow = {
  id: string;
  provider: string;
  status: string;
  received_at: string;
  processed_at: string | null;
  last_error: string | null;
  attempt_count: number;
  payload_preview: string | null;
};

type Props = {
  tenantId?: string | null;
  devFallbackRole?: "financeiro" | "operador" | "admin";
};

export function ErpWebhookInboxPanel({ tenantId = null, devFallbackRole = "financeiro" }: Props) {
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "processed" | "ignored" | "error">("pending");
  const [items, setItems] = useState<InboxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "30" });
    if (statusFilter) qs.set("status", statusFilter);
    const res = await fetchWithSupabaseSession(`/api/integrations/webhooks/inbox?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: InboxRow[]; total: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setTotal(0);
      setMessage(json.error?.message ?? "Não foi possível carregar webhooks.");
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

  useTenantTableRefresh(tenantId, ["erp_webhook_inbox"], load);

  async function onProcessPending() {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      "/api/integrations/webhooks/inbox/process",
      { method: "POST" },
      devFallbackRole
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { processed: number; ignored: number; errors: number; scanned: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao processar webhooks.");
      return;
    }
    const d = json.data;
    setMessage(
      `Analisados: ${d?.scanned ?? 0}; processados: ${d?.processed ?? 0}; ignorados: ${d?.ignored ?? 0}; erros: ${d?.errors ?? 0}.`
    );
    await load();
  }

  async function onReprocess(id: string) {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/integrations/webhooks/inbox/${id}/reprocess`,
      { method: "POST" },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Não foi possível recolocar na fila.");
      return;
    }
    setMessage("Webhook recolocado como pendente.");
    await load();
  }

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Webhooks ERP (entrada)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="processed">Processados</option>
            <option value="ignored">Ignorados</option>
            <option value="error">Erro</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
            Actualizar
          </button>
          <button type="button" onClick={() => void onProcessPending()} className="text-sm font-medium text-amber-800">
            Processar pendentes
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sem webhooks ({total} no total).</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 text-sm">
          {items.map((row) => (
            <li key={row.id} className="py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-amber-800">{row.provider}</span>
                  <span className="text-slate-600"> · {row.status}</span>
                  <span className="font-mono text-xs text-slate-500"> · {row.id.slice(0, 8)}…</span>
                  <p className="text-xs text-slate-500">
                    Recebido{" "}
                    {new Date(row.received_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {row.processed_at
                      ? ` · processado ${new Date(row.processed_at).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short"
                        })}`
                      : null}
                  </p>
                  {row.last_error ? <p className="text-xs text-red-700">{row.last_error}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs text-slate-600"
                    onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                  >
                    {expandedId === row.id ? "Ocultar" : "Payload"}
                  </button>
                  {row.status === "error" || row.status === "ignored" ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-amber-800"
                      onClick={() => void onReprocess(row.id)}
                    >
                      Reprocessar
                    </button>
                  ) : null}
                </div>
              </div>
              {expandedId === row.id && row.payload_preview ? (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                  {row.payload_preview}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
