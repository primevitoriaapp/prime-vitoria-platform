"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { ClientMonthSummary } from "@/lib/client/client-month-summary";

type Props = {
  /** Só no modo preview da Prime; o gestor usa a empresa da própria sessão. */
  clientId?: string;
  devFallbackRole?: "cliente" | "admin";
  reloadKey?: number;
};

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Demonstrativo do mês para o gestor: corridas, KM rodado e valor até agora. */
export function ClientMonthDashboard({ clientId, devFallbackRole = "cliente", reloadKey = 0 }: Props) {
  const [month, setMonth] = useState(currentMonthKey);
  const [data, setData] = useState<ClientMonthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (clientId) params.set("client_id", clientId);
    const res = await fetchWithSupabaseSession(`/api/client-portal/summary?${params}`, {}, devFallbackRole);
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: ClientMonthSummary };
    setData(res.ok && json.success ? (json.data ?? null) : null);
    setLoading(false);
  }, [month, clientId, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const isCurrent = month === currentMonthKey();

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-prime-muted">Demonstrativo do mês</h2>
        <div className="flex items-center gap-1 text-sm">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-md px-2 py-1 hover:bg-prime-bg" aria-label="Mês anterior">
            ‹
          </button>
          <span className="min-w-[9.5rem] text-center font-medium">{monthLabel(month)}</span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={isCurrent}
            className="rounded-md px-2 py-1 hover:bg-prime-bg disabled:opacity-30"
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-prime-bg" />
      ) : !data ? (
        <p className="mt-4 text-sm text-prime-muted">Não foi possível carregar o resumo agora.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-[#111] p-4 text-[#fff] sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-white/60">{isCurrent ? "Valor até agora" : "Valor do mês"}</p>
              <p className="mt-1 font-prime-display text-3xl text-prime-gold">{brl(data.amount_completed)}</p>
              <p className="mt-1 text-xs text-white/50">Corridas concluídas{data.completed_without_amount ? ` · ${data.completed_without_amount} em fechamento` : ""}</p>
            </div>
            <div className="rounded-xl bg-prime-bg p-4">
              <p className="text-xs uppercase tracking-wide text-prime-muted">Corridas feitas</p>
              <p className="mt-1 text-2xl font-semibold">{data.completed}</p>
            </div>
            <div className="rounded-xl bg-prime-bg p-4">
              <p className="text-xs uppercase tracking-wide text-prime-muted">KM rodados</p>
              <p className="mt-1 text-2xl font-semibold">{data.km.toLocaleString("pt-BR")}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-prime-muted">
            {data.upcoming} agendada{data.upcoming === 1 ? "" : "s"} · {data.cancelled} cancelada{data.cancelled === 1 ? "" : "s"} no mês.
          </p>
        </>
      )}
    </section>
  );
}
