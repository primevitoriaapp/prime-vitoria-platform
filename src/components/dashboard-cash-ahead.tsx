"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Data = {
  receber: {
    enviadas_total: number;
    enviadas_count: number;
    vencidas_total: number;
    vencidas_count: number;
    a_enviar_total: number;
    a_enviar_count: number;
    a_fechar_total: number;
    a_fechar_count: number;
    a_aprovar_total: number;
    a_aprovar_count: number;
    agendadas_7d_total: number;
    agendadas_7d_count: number;
    proximas: { id: string; number: number; client: string; due_date: string; total: number; status: string; late: boolean }[];
  };
  pagar: { motoristas_total: number; motoristas_7d: number; contas_total: number; contas_7d: number };
  saldo_30d: { receber: number; pagar: number; saldo: number };
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const br = (ymd: string) => ymd.split("-").reverse().slice(0, 2).join("/");

/** Início: o dinheiro que vem pela frente (a receber, a pagar e saldo previsto de 30 dias). */
export function DashboardCashAhead() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession("/api/reports/cash-ahead", {}, "admin")
      .then((r) => r.json())
      .then((j) => (j?.success ? setD(j.data as Data) : null))
      .catch(() => undefined);
  }, []);
  if (!d) return <div className="mt-6 h-48 animate-pulse rounded-2xl border border-prime-border bg-white" />;
  const r = d.receber;
  const tile = (label: string, value: number, sub: string, href: string, tone = "") => (
    <a href={href} className={`grid gap-0.5 rounded-xl border border-prime-border bg-white p-3 hover:border-prime-gold ${tone}`}>
      <span className="text-xs text-prime-muted">{label}</span>
      <span className="text-lg font-bold tabular-nums">{brl(value)}</span>
      <span className="text-[11px] text-prime-muted">{sub}</span>
    </a>
  );
  return (
    <section className="mt-6 grid gap-4 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Dinheiro pela frente</h2>
          <p className="text-sm text-prime-muted">O que vamos receber e o que vamos pagar</p>
        </div>
        <div className={`rounded-xl px-4 py-2 ${d.saldo_30d.saldo >= 0 ? "bg-[#111] text-[#fff]" : "bg-red-700 text-[#fff]"}`}>
          <p className="text-[11px] text-[#C8C3B8]">Saldo previsto · 30 dias</p>
          <p className="text-xl font-bold tabular-nums">{brl(d.saldo_30d.saldo)}</p>
          <p className="text-[11px] text-[#C8C3B8]">
            entra {brl(d.saldo_30d.receber)} · sai {brl(d.saldo_30d.pagar)}
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-semibold text-emerald-800">A receber</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {tile("Faturas enviadas", r.enviadas_total, `${r.enviadas_count} aguardando pagamento`, "/finance")}
          {tile("Vencidas", r.vencidas_total, r.vencidas_count ? `${r.vencidas_count} para cobrar` : "nenhuma ✓", "/finance", r.vencidas_count ? "border-red-300 bg-red-50" : "")}
          {tile("Faturadas, falta enviar", r.a_enviar_total, `${r.a_enviar_count} fatura(s)`, "/finance", r.a_enviar_count ? "border-amber-300 bg-amber-50" : "")}
          {tile("Aprovadas, falta fechar", r.a_fechar_total, `${r.a_fechar_count} corrida(s)`, "/finance")}
          {tile("Falta aprovar", r.a_aprovar_total, `${r.a_aprovar_count} corrida(s)`, "/conferencia")}
          {tile("Agendadas · 7 dias", r.agendadas_7d_total, `${r.agendadas_7d_count} corrida(s)`, "/agenda")}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-2">
          <p className="text-sm font-semibold">Próximos recebimentos</p>
          {!r.proximas.length ? <p className="text-sm text-prime-muted">Nenhuma fatura em aberto.</p> : null}
          <ul className="divide-y divide-prime-border rounded-xl border border-prime-border">
            {r.proximas.map((p) => (
              <li key={p.id}>
                <a href={`/finance/faturas/${p.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-prime-bg">
                  <span className="min-w-0 truncate">
                    <b>{p.client}</b> <span className="text-prime-muted">· nº {p.number}{p.status === "aberta" ? " · falta enviar" : ""}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <b className="tabular-nums">{brl(p.total)}</b>
                    <span className={`block text-[11px] ${p.late ? "font-semibold text-red-700" : "text-prime-muted"}`}>{p.late ? `venceu ${br(p.due_date)}` : `vence ${br(p.due_date)}`}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <p className="text-sm font-semibold text-red-800">A pagar</p>
          {tile("Motoristas", d.pagar.motoristas_total, `${brl(d.pagar.motoristas_7d)} nos próximos 7 dias`, "/finance")}
          {tile("Contas da empresa", d.pagar.contas_total, `${brl(d.pagar.contas_7d)} nos próximos 7 dias`, "/contas-a-pagar")}
        </div>
      </div>
    </section>
  );
}
