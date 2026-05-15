"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type IssueRow = {
  id: string;
  provider: string;
  entity_type: string;
  entity_id: string;
  issue_type: string;
  status: string;
  created_at: string;
  details: Record<string, unknown>;
};

type Props = {
  tenantId?: string | null;
  devFallbackRole?: "financeiro" | "operador" | "admin";
};

export function ReconciliationIssuesPanel({ tenantId = null, devFallbackRole = "financeiro" }: Props) {
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved">("open");
  const [items, setItems] = useState<IssueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: "30", status: statusFilter });
    const res = await fetchWithSupabaseSession(`/api/integrations/reconciliation-issues?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: IssueRow[]; total: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setTotal(0);
      setMessage(json.error?.message ?? "Não foi possível carregar divergências.");
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

  useTenantTableRefresh(tenantId, ["erp_reconciliation_issues"], load);

  async function onResolve(issueId: string) {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/integrations/reconciliation-issues/${issueId}`,
      { method: "PATCH", body: JSON.stringify({ status: "resolved" }) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Não foi possível resolver.");
      return;
    }
    setMessage("Divergência marcada como resolvida.");
    await load();
  }

  async function onReconcile() {
    setMessage(null);
    const res = await fetchWithSupabaseSession("/api/jobs/reconcile/run", { method: "POST" }, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { issues: number; scanned: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha na reconciliação.");
      return;
    }
    setMessage(`Analisados: ${json.data?.scanned ?? 0}; novos issues: ${json.data?.issues ?? 0}.`);
    await load();
  }

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Divergências ERP</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="open">Abertas</option>
            <option value="resolved">Resolvidas</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
            Actualizar
          </button>
          <button type="button" onClick={() => void onReconcile()} className="text-sm font-medium text-amber-800">
            Executar reconciliação
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sem divergências ({total} no total).</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 text-sm">
          {items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div>
                <span className="font-medium text-amber-800">{row.provider}</span>
                <span className="text-slate-600"> · {row.issue_type}</span>
                <span className="font-mono text-xs text-slate-500"> · {row.entity_id.slice(0, 8)}…</span>
                <p className="text-xs text-slate-500">
                  {new Date(row.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
              {row.status === "open" ? (
                <button
                  type="button"
                  className="text-xs font-medium text-amber-800"
                  onClick={() => void onResolve(row.id)}
                >
                  Resolver
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
