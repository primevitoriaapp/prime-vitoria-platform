"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Summary = {
  trip_id: string;
  financial_status: string;
  has_receivable: boolean;
  receivable: { id: string; amount?: number; due_date: string; status: string } | null;
  financial: { net_margin: number; amount_client: number; amount_driver: number } | null;
  erp_mappings: { provider: string; external_id: string; sync_status: string }[];
  can_enqueue_erp: boolean;
};

type Props = {
  tripId: string;
  devFallbackRole?: "financeiro" | "admin" | "operador";
  writeMode?: boolean;
};

export function TripFinanceErpPanel({ tripId, devFallbackRole = "admin", writeMode = true }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [amountClient, setAmountClient] = useState("0");
  const [amountDriver, setAmountDriver] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/finance-summary`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: Summary; error?: { message?: string } };
    if (!res.ok || !json.success || !json.data) {
      setSummary(null);
      setMessage(json.error?.message ?? "Sem acesso ao resumo financeiro.");
      setLoading(false);
      return;
    }
    setSummary(json.data);
    if (json.data.financial) {
      setAmountClient(String(json.data.financial.amount_client));
      setAmountDriver(String(json.data.financial.amount_driver));
    }
    setLoading(false);
  }, [tripId, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/finance/trips/${tripId}/generate`,
      {
        method: "POST",
        body: JSON.stringify({
          amount_client: Number(amountClient),
          amount_driver: Number(amountDriver),
          tolls: 0,
          parking: 0,
          extras: 0,
          discount: 0
        })
      },
      devFallbackRole === "operador" ? "admin" : devFallbackRole
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { net_margin: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao gerar financeiro.");
      return;
    }
    setMessage("Valores salvos e cobrança atualizada.");
    await load();
  }

  async function enqueueErp(provider: "omie" | "conta_azul") {
    if (!summary?.receivable?.id) {
      setMessage("Gere o financeiro da corrida antes de sincronizar com o ERP.");
      return;
    }
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      "/api/integrations/jobs",
      {
        method: "POST",
        body: JSON.stringify({
          provider,
          entity_type: "receivable",
          entity_id: summary.receivable.id
        })
      },
      devFallbackRole === "financeiro" ? "financeiro" : "operador"
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { job_id: string; deduplicated?: boolean };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao enfileirar ERP.");
      return;
    }
    setMessage(
      json.data?.deduplicated
        ? "Já está na fila de envio."
        : "Enviado para a fila. O sistema contábil recebe em instantes."
    );
  }

  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl border border-prime-border bg-white" />;
  }

  if (!summary) {
    return message ? <p className="text-sm text-red-700">{message}</p> : null;
  }

  const showAmounts = summary.receivable?.amount != null;
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const STATUS: Record<string, string> = { open: "em aberto", pending: "em aberto", paid: "pago", overdue: "vencido", cancelled: "cancelado", partially_paid: "pago em parte" };
  const due = summary.receivable?.due_date ? summary.receivable.due_date.slice(0, 10).split("-").reverse().join("/") : null;
  const c = Number(String(amountClient).replace(",", ".")) || 0;
  const d = Number(String(amountDriver).replace(",", ".")) || 0;

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight text-prime-text">{writeMode ? "Financeiro da corrida" : "Envio ao sistema contábil"}</h3>
          {summary.has_receivable ? (
            <p className="mt-1 text-sm text-prime-muted">
              Cobrança gerada{showAmounts && summary.receivable?.amount != null ? `: ${brl(Number(summary.receivable.amount))}` : ""}
              {due ? ` · vence ${due}` : ""}
              {summary.receivable?.status ? ` · ${STATUS[summary.receivable.status] ?? summary.receivable.status}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-prime-muted">A cobrança desta corrida ainda não foi gerada.</p>
          )}
        </div>
        {summary.financial && showAmounts ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Margem {brl(Number(summary.financial.net_margin))}</span>
        ) : null}
      </div>
      {writeMode ? (
        <form onSubmit={(e) => void onGenerate(e)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-prime-text">Cliente paga (R$)</span>
            <input type="number" step="0.01" inputMode="decimal" value={amountClient} onChange={(e) => setAmountClient(e.target.value)} className="prime-input text-lg font-semibold" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-prime-text">Motorista recebe (R$)</span>
            <input type="number" step="0.01" inputMode="decimal" value={amountDriver} onChange={(e) => setAmountDriver(e.target.value)} className="prime-input text-lg font-semibold" />
          </label>
          <button type="submit" className="btn-primary h-[46px]">
            {summary.has_receivable ? "Atualizar valores" : "Gerar cobrança"}
          </button>
          {c > 0 ? <p className="text-sm text-prime-muted sm:col-span-3">Fica para a Prime: <b className="text-prime-text">{brl(c - d)}</b></p> : null}
        </form>
      ) : null}
      {summary.can_enqueue_erp ? (
        <details className="mt-4 rounded-xl border border-prime-border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-prime-text">Enviar para o sistema contábil (Omie ou Conta Azul)</summary>
          {summary.erp_mappings.length > 0 ? (
            <ul className="mt-2 text-prime-muted">
              {summary.erp_mappings.map((m) => (
                <li key={m.provider}>
                  {m.provider === "omie" ? "Omie" : "Conta Azul"}: {m.sync_status === "synced" ? "enviado" : m.sync_status}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-outline" disabled={!summary.has_receivable} onClick={() => void enqueueErp("omie")}>
              Enviar para Omie
            </button>
            <button type="button" className="btn-outline" disabled={!summary.has_receivable} onClick={() => void enqueueErp("conta_azul")}>
              Enviar para Conta Azul
            </button>
          </div>
          {!summary.has_receivable ? <p className="mt-2 text-xs text-prime-muted">Gere a cobrança primeiro.</p> : null}
        </details>
      ) : null}
      {message ? <p className="mt-3 text-sm text-prime-text">{message}</p> : null}
    </section>
  );
}
