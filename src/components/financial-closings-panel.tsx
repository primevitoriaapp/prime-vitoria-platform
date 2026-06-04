"use client";

import { useCallback, useEffect, useState } from "react";
import { DateInput } from "@/components/date-input";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type ClosingRow = {
  id: string;
  period_start: string;
  period_end: string;
  entity_type: string;
  entity_id: string;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  status: string;
};

type DreBlock = {
  revenue_clients: number;
  cost_clients: number;
  margin_clients: number;
  payout_drivers: number;
  net_margin: number;
  closing_rows: number;
  closed_rows: number;
  draft_rows: number;
};

type Props = {
  tenantId: string | null;
  devFallbackRole?: "financeiro" | "admin";
};

function monthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export function FinancialClosingsPanel({ tenantId = null, devFallbackRole = "financeiro" }: Props) {
  const bounds = monthBounds();
  const [periodStart, setPeriodStart] = useState(bounds.start);
  const [periodEnd, setPeriodEnd] = useState(bounds.end);
  const [items, setItems] = useState<ClosingRow[]>([]);
  const [dre, setDre] = useState<DreBlock | null>(null);
  const [arAp, setArAp] = useState<{
    receivables: { open_count: number; open_amount: number; paid_in_period_amount: number };
    payables: { open_count: number; open_amount: number; paid_in_period_amount: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadDre = useCallback(async () => {
    const qs = new URLSearchParams({ period_start: periodStart, period_end: periodEnd });
    const res = await fetchWithSupabaseSession(`/api/finance/summary/dre?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        dre: DreBlock;
        receivables: { open_count: number; open_amount: number; paid_in_period_amount: number };
        payables: { open_count: number; open_amount: number; paid_in_period_amount: number };
        hint?: string | null;
      };
    };
    if (res.ok && json.success && json.data) {
      setDre(json.data.dre);
      setArAp({ receivables: json.data.receivables, payables: json.data.payables });
      if (json.data.hint) setMessage(json.data.hint);
    }
  }, [periodStart, periodEnd, devFallbackRole]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({
      page: "1",
      pageSize: "50",
      period_start: periodStart,
      period_end: periodEnd
    });
    const res = await fetchWithSupabaseSession(`/api/finance/closings?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: ClosingRow[]; dre?: DreBlock | null };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setMessage(json.error?.message ?? "Não foi possível carregar fechamentos.");
      setLoading(false);
      return;
    }
    setItems(json.data?.items ?? []);
    if (json.data?.dre) setDre(json.data.dre);
    setLoading(false);
    await loadDre();
  }, [periodStart, periodEnd, devFallbackRole, loadDre]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["financial_closings", "accounts_receivable", "driver_payables"], load);

  async function onGenerate() {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      "/api/finance/closings/generate",
      {
        method: "POST",
        body: JSON.stringify({ period_start: periodStart, period_end: periodEnd })
      },
      devFallbackRole
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { entities: number; skipped_closed?: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao gerar fechamentos.");
      return;
    }
    const skipped = json.data?.skipped_closed ?? 0;
    setMessage(
      `Rascunhos: ${json.data?.entities ?? 0}${skipped ? ` (${skipped} fechados ignorados)` : ""}.`
    );
    await load();
  }

  async function onClose(id: string) {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/finance/closings/${id}/close`,
      { method: "POST" },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao fechar.");
      return;
    }
    setMessage("Fechamento confirmado.");
    await load();
  }

  async function onReopen(id: string) {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/finance/closings/${id}/reopen`,
      { method: "POST", body: JSON.stringify({ reason: "reabertura manual" }) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao reabrir.");
      return;
    }
    setMessage("Fechamento reaberto.");
    await load();
  }

  async function onCloseAll(enqueueErp: boolean) {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      "/api/finance/closings/close-all",
      {
        method: "POST",
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
          enqueue_erp: enqueueErp,
          erp_provider: enqueueErp ? "omie" : undefined
        })
      },
      devFallbackRole
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { closed: number; skipped: number; erp_enqueued?: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao fechar em lote.");
      return;
    }
    const d = json.data;
    setMessage(
      `Fechados: ${d?.closed ?? 0}${d?.erp_enqueued ? `; ERP enfileirados: ${d.erp_enqueued}` : ""}.`
    );
    await load();
  }

  async function openDreHtml() {
    const qs = new URLSearchParams({
      format: "html",
      period_start: periodStart,
      period_end: periodEnd
    });
    const res = await fetchWithSupabaseSession(`/api/finance/summary/dre?${qs}`, {}, devFallbackRole);
    if (!res.ok) {
      setMessage("Falha ao gerar DRE HTML.");
      return;
    }
    const html = await res.text();
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      setMessage("Permita pop-ups para imprimir o DRE.");
      return;
    }
    w.document.write(html);
    w.document.close();
    setMessage("DRE aberto — use Imprimir / Guardar como PDF.");
  }

  async function downloadCsv() {
    const qs = new URLSearchParams({
      format: "csv",
      page: "1",
      pageSize: "500",
      period_start: periodStart,
      period_end: periodEnd
    });
    const res = await fetchWithSupabaseSession(`/api/finance/closings?${qs}`, {}, devFallbackRole);
    if (!res.ok) {
      setMessage("Falha ao exportar CSV.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fechamentos-${periodStart}-${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("CSV descarregado.");
  }

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <section className="card mt-6">
      <h2 className="text-lg font-semibold text-slate-900">Fechamento mensal</h2>
      <p className="mt-1 text-sm text-slate-600">
        Agrega margens de viagens com financeiro gerado no período (clientes e motoristas).
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Início
          <DateInput
            value={periodStart}
            onChange={(iso) => setPeriodStart(iso ?? "")}
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Fim
          <DateInput
            value={periodEnd}
            onChange={(iso) => setPeriodEnd(iso ?? "")}
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <button type="button" onClick={() => void onGenerate()} className="text-sm font-medium text-amber-800">
          Gerar rascunhos
        </button>
        <button type="button" onClick={() => void downloadCsv()} className="text-sm">
          Exportar CSV
        </button>
        <button type="button" onClick={() => void openDreHtml()} className="text-sm">
          DRE / PDF
        </button>
        <button type="button" onClick={() => void onCloseAll(false)} className="text-sm font-medium text-amber-800">
          Fechar todos
        </button>
        <button type="button" onClick={() => void onCloseAll(true)} className="text-sm text-amber-900">
          Fechar todos + ERP
        </button>
        <button type="button" onClick={() => void load()} disabled={loading} className="text-sm">
          Actualizar
        </button>
      </div>

      {dre ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-slate-500">Receita (clientes)</p>
            <p className="font-semibold text-slate-900">{fmt(dre.revenue_clients)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Margem líquida</p>
            <p className="font-semibold text-emerald-800">{fmt(dre.net_margin)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Repasse motoristas</p>
            <p className="font-semibold text-slate-900">{fmt(dre.payout_drivers)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Linhas fechamento</p>
            <p className="font-semibold text-slate-900">
              {dre.closing_rows} ({dre.closed_rows} fechadas, {dre.draft_rows} rascunho)
            </p>
          </div>
          {arAp ? (
            <>
              <div>
                <p className="text-xs uppercase text-slate-500">A receber em aberto</p>
                <p className="text-slate-800">
                  {arAp.receivables.open_count} · {fmt(arAp.receivables.open_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Recebido no período</p>
                <p className="text-slate-800">{fmt(arAp.receivables.paid_in_period_amount)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">A pagar motoristas</p>
                <p className="text-slate-800">
                  {arAp.payables.open_count} · {fmt(arAp.payables.open_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Pago no período</p>
                <p className="text-slate-800">{fmt(arAp.payables.paid_in_period_amount)}</p>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sem fechamentos para o período.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-2">Entidade</th>
                <th className="py-2 pr-2">Bruto</th>
                <th className="py-2 pr-2">Custo</th>
                <th className="py-2 pr-2">Margem</th>
                <th className="py-2 pr-2">Estado</th>
                <th className="py-2">Acção</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <span className="font-medium">{row.entity_type}</span>
                    <span className="font-mono text-xs text-slate-500"> · {row.entity_id.slice(0, 8)}…</span>
                  </td>
                  <td className="py-2 pr-2">{fmt(Number(row.gross_amount))}</td>
                  <td className="py-2 pr-2">{fmt(Number(row.cost_amount))}</td>
                  <td className="py-2 pr-2">{fmt(Number(row.margin_amount))}</td>
                  <td className="py-2 pr-2">{row.status}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {row.status === "draft" || row.status === "reopened" ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-amber-800"
                          onClick={() => void onClose(row.id)}
                        >
                          Fechar
                        </button>
                      ) : null}
                      {row.status === "closed" ? (
                        <button
                          type="button"
                          className="text-xs text-slate-600"
                          onClick={() => void onReopen(row.id)}
                        >
                          Reabrir
                        </button>
                      ) : null}
                    </div>
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
