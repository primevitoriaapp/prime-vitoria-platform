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
    setMessage(`Financeiro gerado. Margem: ${json.data?.net_margin ?? "—"}.`);
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
        ? `Job ${provider} já em fila.`
        : `Sync ${provider} enfileirado. Processe em Despacho → filas de jobs.`
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-600">A carregar financeiro…</p>;
  }

  if (!summary) {
    return message ? <p className="text-sm text-red-700">{message}</p> : null;
  }

  const showAmounts = summary.receivable?.amount != null;

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-semibold text-slate-900">
        {writeMode ? "Financeiro e ERP" : "Sincronização ERP"}
      </h3>
      {summary.has_receivable ? (
        <p className="mt-1 text-sm text-slate-700">
          Título:{" "}
          {showAmounts && summary.receivable?.amount != null
            ? Number(summary.receivable.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : "—"}{" "}
          · venc. {summary.receivable?.due_date} · {summary.receivable?.status}
          {summary.financial && showAmounts ? (
            <>
              {" "}
              · margem{" "}
              {Number(summary.financial.net_margin).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL"
              })}
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-600">Ainda sem título a receber para esta corrida.</p>
      )}
      {summary.erp_mappings.length > 0 ? (
        <ul className="mt-2 text-xs text-slate-600">
          {summary.erp_mappings.map((m) => (
            <li key={m.provider}>
              ERP {m.provider}: {m.sync_status} ({m.external_id.slice(0, 12)}…)
            </li>
          ))}
        </ul>
      ) : null}
      {writeMode ? (
        <form onSubmit={(e) => void onGenerate(e)} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            type="number"
            value={amountClient}
            onChange={(e) => setAmountClient(e.target.value)}
            placeholder="Valor cliente"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            type="number"
            value={amountDriver}
            onChange={(e) => setAmountDriver(e.target.value)}
            placeholder="Valor motorista"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="submit" className="text-sm font-medium text-amber-800">
            Gerar / actualizar financeiro
          </button>
        </form>
      ) : null}
      {summary.can_enqueue_erp ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="text-sm text-amber-800"
            disabled={!summary.has_receivable}
            onClick={() => void enqueueErp("omie")}
          >
            Enfileirar Omie
          </button>
          <button
            type="button"
            className="text-sm text-amber-800"
            disabled={!summary.has_receivable}
            onClick={() => void enqueueErp("conta_azul")}
          >
            Enfileirar Conta Azul
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
