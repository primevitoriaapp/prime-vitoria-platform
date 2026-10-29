"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { companyLabel, useCompany } from "@/lib/company/company-context";
import { categoryLabel } from "@/lib/finance/company-payables-calc";

type Report = {
  from: string;
  to: string;
  today: string;
  monthly: { month: string; revenue: number; driverCost: number; expenses: number; result: number; trips: number }[];
  banks: { id: string; label: string; bank: string; issuer: string; balance: number; balance_date: string | null }[];
  dre: {
    grossRevenue: number;
    tripRevenue: number;
    otherRevenue: number;
    driverCost: number;
    contribution: number;
    contributionPct: number;
    expenses: number;
    taxes: number;
    expensesByCategory: { category: string; amount: number }[];
    result: number;
    resultPct: number;
    trips: number;
    avgTicket: number;
  };
  cash: { received: number; paidExpenses: number; paidDrivers: number; result: number };
  open: { receive: number; pay: number; overdue: number; defaultRate: number };
  forecast: { days: number; receive: number; pay: number; balance: number }[];
  aging: { label: string; amount: number; count: number }[];
  clients: { id: string; name: string; trips: number; revenue: number; cost: number; margin: number; marginPct: number; share: number; overdue: number }[];
  concentration: { name: string; share: number } | null;
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");
const todaySp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const lastDay = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const shift = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

const PRESETS = [
  { id: "mes", label: "Este mês" },
  { id: "anterior", label: "Mês passado" },
  { id: "trimestre", label: "Últimos 3 meses" },
  { id: "ano", label: "Este ano" },
  { id: "custom", label: "Escolher datas" }
] as const;
type Preset = (typeof PRESETS)[number]["id"];

function rangeOf(p: Preset, today: string): { from: string; to: string } {
  const ym = today.slice(0, 7);
  if (p === "anterior") return { from: `${shift(ym, -1)}-01`, to: lastDay(shift(ym, -1)) };
  if (p === "trimestre") return { from: `${shift(ym, -2)}-01`, to: today };
  if (p === "ano") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: `${ym}-01`, to: today };
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = typeof v === "number" ? v.toFixed(2).replace(".", ",") : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "gold" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "gold" ? "text-prime-gold" : "";
  return (
    <div className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-prime-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-prime-muted">{hint}</p> : null}
    </div>
  );
}

function Section({ title, onCsv, children }: { title: string; onCsv?: () => void; children: ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {onCsv ? (
          <button type="button" onClick={onCsv} className="rounded-lg px-2 py-1 text-xs font-semibold text-prime-gold ring-1 ring-prime-border hover:ring-prime-gold print:hidden">
            Baixar planilha
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Line({ label, value, strong, minus, pct }: { label: string; value: number; strong?: boolean; minus?: boolean; pct?: number }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${strong ? "border-t border-prime-border font-semibold" : "text-sm"}`}>
      <span className={minus ? "pl-3 text-prime-muted" : ""}>
        {minus ? "(−) " : ""}
        {label}
      </span>
      <span className={strong && value < 0 ? "text-red-700" : ""}>
        {brl(value)}
        {pct != null ? <span className="ml-2 text-xs text-prime-muted">{pct}%</span> : null}
      </span>
    </div>
  );
}

/** Painel financeiro completo: DRE, caixa, previsão, inadimplência, margem por cliente e exportação. */
export function FinanceDashboardPanel() {
  const { company } = useCompany();
  const today = todaySp();
  const [preset, setPreset] = useState<Preset>("mes");
  const [range, setRange] = useState(rangeOf("mes", today));
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ from: range.from, to: range.to, empresa: company });
    const res = await fetchWithSupabaseSession(`/api/finance/painel?${qs}`, {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Report; error?: { message?: string } };
    if (res.ok && json.success && json.data) setData(json.data);
    else setErr(json.error?.message ?? "Não foi possível carregar o painel.");
    setLoading(false);
  }, [range, company]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(rangeOf(p, today));
  };

  const tag = `${range.from}_a_${range.to}${company !== "todas" ? `_${company}` : ""}`;
  const d = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => pick(p.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${preset === p.id ? "bg-[#111] text-[#fff] ring-[#111]" : "bg-white ring-prime-border hover:ring-prime-gold"}`}
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" ? (
          <span className="flex items-center gap-2">
            <input type="date" className={PRIME_INPUT_CLASS} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            até
            <input type="date" className={PRIME_INPUT_CLASS} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </span>
        ) : null}
        <button type="button" onClick={() => window.print()} className="ml-auto rounded-xl bg-[#111] px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-black">
          Imprimir / salvar PDF
        </button>
      </div>

      <p className="text-sm text-prime-muted">
        Período <strong>{brDate(range.from)}</strong> a <strong>{brDate(range.to)}</strong> · {company === "todas" ? "Todas as empresas" : companyLabel(company)}
        {loading ? " · carregando…" : ""}
      </p>
      {err ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p> : null}

      {d ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Faturamento" value={brl(d.dre.grossRevenue)} hint={`${d.dre.trips} corrida(s) · ticket médio ${brl(d.dre.avgTicket)}`} tone="gold" />
            <Kpi label="Resultado do período" value={brl(d.dre.result)} hint={`Margem líquida ${d.dre.resultPct}%`} tone={d.dre.result >= 0 ? "good" : "bad"} />
            <Kpi label="Caixa do período" value={brl(d.cash.result)} hint={`Entrou ${brl(d.cash.received)} · saiu ${brl(d.cash.paidExpenses + d.cash.paidDrivers)}`} tone={d.cash.result >= 0 ? "good" : "bad"} />
            <Kpi label="Inadimplência" value={brl(d.open.overdue)} hint={`${d.open.defaultRate}% do que está a receber`} tone={d.open.overdue > 0 ? "bad" : "good"} />
          </div>

          {d.concentration && d.concentration.share >= 40 ? (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Atenção à concentração:</strong> {d.concentration.name} responde por {d.concentration.share}% do faturamento do período. Se esse cliente atrasar ou sair, o
              caixa sente direto.
            </p>
          ) : null}

          <Section
            title="Evolução dos últimos 12 meses"
            onCsv={() =>
              downloadCsv(`evolucao_12_meses${company !== "todas" ? `_${company}` : ""}.csv`, [
                ["Mês", "Corridas", "Faturamento", "Custo motoristas", "Despesas", "Resultado"],
                ...d.monthly.map((m) => [m.month, m.trips, m.revenue, m.driverCost, m.expenses, m.result])
              ])
            }
          >
            <MonthlyChart data={d.monthly} />
          </Section>

          {d.banks.length ? (
            <Section title="Saldo nas contas bancárias">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {d.banks.map((b) => (
                  <div key={b.id} className="rounded-xl bg-prime-bg p-3">
                    <p className="text-xs text-prime-muted">
                      {b.bank} · {companyLabel(b.issuer)}
                    </p>
                    <p className="font-medium">{b.label}</p>
                    <p className={`mt-1 text-xl font-semibold ${b.balance < 0 ? "text-red-700" : ""}`}>{brl(b.balance)}</p>
                    <p className="text-[11px] text-prime-muted">{b.balance_date ? `até ${brDate(b.balance_date)}` : "sem extrato importado"}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-prime-muted">
                Total: <b>{brl(d.banks.reduce((s, b) => s + b.balance, 0))}</b>. O saldo se atualiza a cada extrato importado em{" "}
                <Link href={"/conciliacao" as Route} className="text-prime-gold underline">
                  Conciliação bancária
                </Link>
                .
              </p>
            </Section>
          ) : (
            <p className="rounded-xl border border-dashed border-prime-border bg-white p-3 text-sm text-prime-muted">
              Cadastre suas contas (Sicoob, Santander, XP, Nubank) com o saldo atual em{" "}
              <Link href={"/conciliacao" as Route} className="text-prime-gold underline">
                Conciliação bancária
              </Link>{" "}
              para ver o saldo de cada uma aqui.
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Section
              title="DRE: resultado do período"
              onCsv={() =>
                downloadCsv(`dre_${tag}.csv`, [
                  ["Linha", "Valor"],
                  ["Receita das corridas", d.dre.tripRevenue],
                  ["Outras receitas", d.dre.otherRevenue],
                  ["Receita bruta", d.dre.grossRevenue],
                  ["(-) Custo dos motoristas e parceiros", d.dre.driverCost],
                  ["= Margem de contribuição", d.dre.contribution],
                  ...d.dre.expensesByCategory.map((e) => [`(-) ${categoryLabel(e.category)}`, e.amount] as (string | number)[]),
                  ["= Resultado", d.dre.result]
                ])
              }
            >
              <Line label="Receita das corridas finalizadas" value={d.dre.tripRevenue} />
              {d.dre.otherRevenue ? <Line label="Outras receitas (locação, avulsos…)" value={d.dre.otherRevenue} /> : null}
              {d.dre.otherRevenue ? <Line label="Receita bruta" value={d.dre.grossRevenue} strong /> : null}
              <Line label="Custo dos motoristas e parceiros" value={d.dre.driverCost} minus />
              <Line label="Margem de contribuição" value={d.dre.contribution} strong pct={d.dre.contributionPct} />
              {d.dre.expensesByCategory.length ? (
                d.dre.expensesByCategory.map((e) => <Line key={e.category} label={categoryLabel(e.category)} value={e.amount} minus />)
              ) : (
                <p className="py-1.5 pl-3 text-sm text-prime-muted">Nenhuma despesa lançada em Contas a pagar neste período.</p>
              )}
              <Line label="Resultado" value={d.dre.result} strong pct={d.dre.resultPct} />
              <p className="mt-2 text-xs text-prime-muted">
                Regime de competência: conta o que foi rodado e o que venceu no período, pago ou não. Despesas vêm de{" "}
                <Link href={"/contas-a-pagar" as Route} className="text-prime-gold underline">
                  Contas a pagar
                </Link>
                .
              </p>
            </Section>

            <Section
              title="Caixa: o que entrou e saiu de verdade"
              onCsv={() =>
                downloadCsv(`caixa_${tag}.csv`, [
                  ["Linha", "Valor"],
                  ["Recebido de clientes", d.cash.received],
                  ["(-) Despesas pagas", d.cash.paidExpenses],
                  ["(-) Repasses pagos a motoristas", d.cash.paidDrivers],
                  ["= Saldo do período", d.cash.result]
                ])
              }
            >
              <Line label="Recebido de clientes" value={d.cash.received} />
              <Line label="Despesas pagas" value={d.cash.paidExpenses} minus />
              <Line label="Repasses pagos a motoristas" value={d.cash.paidDrivers} minus />
              <Line label="Saldo do período" value={d.cash.result} strong />
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-prime-bg p-3">
                  <p className="text-xs text-prime-muted">Total a receber em aberto</p>
                  <p className="text-lg font-semibold">{brl(d.open.receive)}</p>
                </div>
                <div className="rounded-xl bg-prime-bg p-3">
                  <p className="text-xs text-prime-muted">Total a pagar em aberto</p>
                  <p className="text-lg font-semibold">{brl(d.open.pay)}</p>
                </div>
              </div>
            </Section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section
              title="Previsão de caixa: próximos 90 dias"
              onCsv={() =>
                downloadCsv(`previsao_${tag}.csv`, [
                  ["Até", "A receber", "A pagar", "Saldo"],
                  ...d.forecast.map((f) => [`${f.days} dias`, f.receive, f.pay, f.balance])
                ])
              }
            >
              <div className="space-y-4">
                {d.forecast.map((f) => {
                  const max = Math.max(1, ...d.forecast.flatMap((x) => [x.receive, x.pay]));
                  return (
                    <div key={f.days}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-semibold">Até {f.days} dias</span>
                        <span className={f.balance >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>Saldo {brl(f.balance)}</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-prime-muted">Receber</span>
                          <span className="h-3 rounded bg-emerald-600" style={{ width: `${(f.receive / max) * 70}%` }} />
                          <span>{brl(f.receive)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-prime-muted">Pagar</span>
                          <span className="h-3 rounded bg-red-500" style={{ width: `${(f.pay / max) * 70}%` }} />
                          <span>{brl(f.pay)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-prime-muted">
                Conta faturas e corridas em aberto contra contas a pagar e repasses ainda não pagos, pela data de vencimento. O que já venceu entra em todas as faixas.
              </p>
            </Section>

            <Section
              title="Inadimplência por atraso"
              onCsv={() => downloadCsv(`inadimplencia_${tag}.csv`, [["Faixa", "Títulos", "Valor"], ...d.aging.map((a) => [a.label, a.count, a.amount])])}
            >
              <div className="space-y-2">
                {d.aging.map((a, i) => (
                  <div key={a.label} className="flex items-center justify-between rounded-xl bg-prime-bg px-3 py-2 text-sm">
                    <span>
                      <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${["bg-amber-400", "bg-orange-500", "bg-red-600", "bg-red-900"][i]}`} />
                      {a.label}
                      <span className="ml-2 text-xs text-prime-muted">{a.count} título(s)</span>
                    </span>
                    <strong>{brl(a.amount)}</strong>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-prime-muted">
                Para cobrar, abra{" "}
                <Link href={"/finance" as Route} className="text-prime-gold underline">
                  Financeiro → faturas
                </Link>
                . Acima de 60 dias, vale contato direto e rever o prazo desse cliente.
              </p>
            </Section>
          </div>

          <Section
            title="Margem por cliente"
            onCsv={() =>
              downloadCsv(`clientes_${tag}.csv`, [
                ["Cliente", "Corridas", "Faturamento", "Custo motoristas", "Margem", "Margem %", "% do faturamento", "Vencido"],
                ...d.clients.map((c) => [c.name, c.trips, c.revenue, c.cost, c.margin, c.marginPct, c.share, c.overdue])
              ])
            }
          >
            {d.clients.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-prime-muted">
                      <th className="py-2">Cliente</th>
                      <th className="py-2 text-right">Corridas</th>
                      <th className="py-2 text-right">Faturamento</th>
                      <th className="py-2 text-right">Custo</th>
                      <th className="py-2 text-right">Margem</th>
                      <th className="py-2 text-right">% fat.</th>
                      <th className="py-2 text-right">Vencido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.clients.map((c) => (
                      <tr key={c.id} className="border-t border-prime-border">
                        <td className="py-2 font-medium">{c.name}</td>
                        <td className="py-2 text-right">{c.trips}</td>
                        <td className="py-2 text-right">{brl(c.revenue)}</td>
                        <td className="py-2 text-right">{brl(c.cost)}</td>
                        <td className={`py-2 text-right font-semibold ${c.marginPct < 15 ? "text-red-700" : c.marginPct < 25 ? "text-amber-700" : "text-emerald-700"}`}>
                          {brl(c.margin)} <span className="text-xs">({c.marginPct}%)</span>
                        </td>
                        <td className="py-2 text-right">{c.share}%</td>
                        <td className={`py-2 text-right ${c.overdue > 0 ? "font-semibold text-red-700" : "text-prime-muted"}`}>{c.overdue > 0 ? brl(c.overdue) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-prime-muted">Margem em vermelho (abaixo de 15%) indica cliente que talvez precise de reajuste de tabela.</p>
              </div>
            ) : (
              <p className="text-sm text-prime-muted">Nenhuma corrida finalizada neste período.</p>
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}

/** Barras do mês: faturamento (dourado) e resultado (verde/vermelho). */
function MonthlyChart({ data }: { data: Report["monthly"] }) {
  const max = Math.max(1, ...data.map((m) => Math.max(m.revenue, Math.abs(m.result))));
  const label = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
  const best = data.reduce((a, b) => (b.revenue > a.revenue ? b : a), data[0]);
  return (
    <div>
      <div className="flex h-48 items-end gap-1.5 overflow-x-auto pb-1 sm:gap-3">
        {data.map((m) => (
          <div key={m.month} className="flex min-w-[28px] flex-1 flex-col items-center gap-1" title={`${m.month}: faturamento ${brl(m.revenue)} · resultado ${brl(m.result)} · ${m.trips} corridas`}>
            <div className="flex h-40 w-full items-end justify-center gap-0.5">
              <span className="w-1/2 rounded-t bg-prime-gold" style={{ height: `${(m.revenue / max) * 100}%` }} />
              <span className={`w-1/2 rounded-t ${m.result < 0 ? "bg-red-500" : "bg-emerald-600"}`} style={{ height: `${(Math.abs(m.result) / max) * 100}%` }} />
            </div>
            <span className="text-[10px] capitalize text-prime-muted">{label(m.month)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-prime-muted">
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-prime-gold" />
          Faturamento
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600" />
          Resultado (vermelho = prejuízo)
        </span>
        {best && best.revenue > 0 ? <span>Melhor mês: {label(best.month)} ({brl(best.revenue)})</span> : null}
      </div>
    </div>
  );
}
