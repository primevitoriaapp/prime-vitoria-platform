"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { PAYABLE_CATEGORIES, categoryLabel, payableSituation, type PayableSituation } from "@/lib/finance/company-payables-calc";

type Row = {
  id: string;
  description: string;
  category: string;
  supplier: string | null;
  amount: number;
  due_date: string;
  status: "aberta" | "paga" | "cancelada";
  paid_at: string | null;
  paid_amount: number | null;
  recurrence: "nenhuma" | "mensal";
  issuer: string | null;
  notes: string | null;
};

const ISSUERS = [
  { id: "", label: "—" },
  { id: "rj_prime", label: "RJ Prime" },
  { id: "prime_servicos", label: "Prime Serviços" },
  { id: "ilha_prime", label: "Ilha Prime" }
];

const SIT: Record<PayableSituation, { label: string; cls: string }> = {
  vencida: { label: "Vencida", cls: "bg-red-600 text-[#fff]" },
  vence_hoje: { label: "Vence hoje", cls: "bg-amber-500 text-[#111]" },
  vence_breve: { label: "Vence em breve", cls: "bg-amber-100 text-amber-900" },
  em_dia: { label: "Em dia", cls: "bg-prime-bg text-prime-muted" },
  paga: { label: "Paga", cls: "bg-emerald-100 text-emerald-800" },
  cancelada: { label: "Cancelada", cls: "bg-gray-100 text-gray-500" }
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");
const todaySp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

const EMPTY = { description: "", category: "outros", supplier: "", amount: "", due_date: todaySp(), recurrence: "nenhuma", issuer: "", notes: "", installments: "1" };

/** Financeiro → contas a pagar da empresa, com vencimentos, recorrência mensal e parcelas. */
export function CompanyPayablesPanel() {
  const today = todaySp();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [overdueOld, setOverdueOld] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"todas" | "abertas" | "pagas">("abertas");

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = monthBounds(month);
    const [a, b] = await Promise.all([
      fetchWithSupabaseSession(`/api/finance/company-payables?from=${from}&to=${to}`, {}, "admin"),
      fetchWithSupabaseSession(`/api/finance/company-payables?status=abertas`, {}, "admin")
    ]);
    const ja = (await a.json().catch(() => ({}))) as { success?: boolean; data?: Row[] };
    const jb = (await b.json().catch(() => ({}))) as { success?: boolean; data?: Row[] };
    setRows(ja.success ? (ja.data ?? []) : []);
    setOverdueOld(jb.success ? (jb.data ?? []).filter((r) => r.due_date < `${month}-01`) : []);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => [...overdueOld, ...rows], [overdueOld, rows]);
  const visible = all.filter((r) => (filter === "todas" ? r.status !== "cancelada" : filter === "abertas" ? r.status === "aberta" : r.status === "paga"));

  const totals = useMemo(() => {
    let open = 0;
    let overdue = 0;
    let paid = 0;
    for (const r of all) {
      if (r.status === "aberta") {
        open += Number(r.amount);
        if (r.due_date < today) overdue += Number(r.amount);
      } else if (r.status === "paga" && r.due_date >= `${month}-01`) paid += Number(r.paid_amount ?? r.amount);
    }
    return { open, overdue, paid };
  }, [all, today, month]);

  async function create() {
    if (form.description.trim().length < 2 || !form.amount.trim()) {
      setMsg({ ok: false, text: "Informe descrição e valor." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetchWithSupabaseSession(
      "/api/finance/company-payables",
      {
        method: "POST",
        body: JSON.stringify({
          ...form,
          supplier: form.supplier || null,
          issuer: form.issuer || null,
          notes: form.notes || null,
          installments: Number(form.installments) || 1
        })
      },
      "admin"
    );
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMsg({ ok: false, text: json.error?.message ?? "Não foi possível salvar." });
      return;
    }
    setMsg({ ok: true, text: "Conta lançada." });
    setForm({ ...EMPTY });
    setShowForm(false);
    void load();
  }

  async function act(r: Row, action: "pagar" | "reabrir" | "cancelar") {
    let body: Record<string, unknown> = { action };
    if (action === "pagar") {
      const v = window.prompt(`Valor pago de "${r.description}":`, String(r.amount).replace(".", ","));
      if (v === null) return;
      body = { action, paid_amount: v };
    }
    if (action === "cancelar" && !window.confirm(`Cancelar "${r.description}"?`)) return;
    setBusy(true);
    const res = await fetchWithSupabaseSession(`/api/finance/company-payables/${r.id}`, { method: "PATCH", body: JSON.stringify(body) }, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { next?: { due_date: string } | null }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMsg({ ok: false, text: json.error?.message ?? "Falhou." });
      return;
    }
    setMsg({
      ok: true,
      text:
        action === "pagar"
          ? json.data?.next
            ? `Paga. A do mês que vem (${brDate(json.data.next.due_date)}) já foi lançada.`
            : "Conta paga."
          : action === "reabrir"
            ? "Conta reaberta."
            : "Conta cancelada."
    });
    void load();
  }

  const monthLabel = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="h-9 w-9 rounded-lg bg-white ring-1 ring-prime-border" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <h2 className="min-w-[170px] text-center text-lg font-semibold capitalize">{monthLabel}</h2>
        <button type="button" className="h-9 w-9 rounded-lg bg-white ring-1 ring-prime-border" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          ›
        </button>
        <div className="ml-2 inline-flex rounded-xl border border-prime-border bg-white p-1 text-sm">
          {(["abertas", "pagas", "todas"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1 ${filter === f ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}>
              {f === "abertas" ? "A pagar" : f === "pagas" ? "Pagas" : "Todas"}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "+ Lançar conta"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#111] bg-[#111] p-4 shadow-prime-card">
          <p className="text-xs text-prime-gold">A pagar (inclui atrasadas)</p>
          <p className="mt-1 text-2xl font-semibold text-[#fff]">{brl(totals.open)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-800">Vencidas</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{brl(totals.overdue)}</p>
        </div>
        <div className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="text-xs text-prime-muted">Pagas no mês</p>
          <p className="mt-1 text-2xl font-semibold">{brl(totals.paid)}</p>
        </div>
      </div>

      {showForm ? (
        <div className="grid gap-3 rounded-2xl border-2 border-prime-gold/60 bg-white p-4 shadow-prime-card sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>Descrição *</span>
            <input className={PRIME_INPUT_CLASS} placeholder="Ex.: Seguro do Corolla, Aluguel da sede" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Categoria</span>
            <select className={PRIME_INPUT_CLASS} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {PAYABLE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Fornecedor / a quem pagar</span>
            <input className={PRIME_INPUT_CLASS} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Valor (R$) *</span>
            <input className={PRIME_INPUT_CLASS} inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.,]/g, "") })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Vencimento *</span>
            <input type="date" className={PRIME_INPUT_CLASS} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Repete</span>
            <select className={PRIME_INPUT_CLASS} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value, installments: "1" })}>
              <option value="nenhuma">Não repete</option>
              <option value="mensal">Todo mês (ao pagar, lança o próximo)</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Parcelas</span>
            <input
              type="number"
              min={1}
              max={60}
              className={PRIME_INPUT_CLASS}
              value={form.installments}
              disabled={form.recurrence === "mensal"}
              onChange={(e) => setForm({ ...form, installments: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Empresa que paga</span>
            <select className={PRIME_INPUT_CLASS} value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })}>
              {ISSUERS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-3">
            <span>Observação</span>
            <input className={PRIME_INPUT_CLASS} placeholder="Ex.: boleto chega por e-mail, código de barras…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="button" disabled={busy} className="btn-primary disabled:opacity-50" onClick={() => void create()}>
              {busy ? "Salvando…" : Number(form.installments) > 1 ? `Lançar ${form.installments} parcelas` : "Lançar conta"}
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-prime-border bg-white shadow-prime-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-2">Vencimento</th>
              <th className="px-3 py-2">Conta</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-prime-border">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-prime-muted">
                  Carregando…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-prime-muted">
                  Nenhuma conta aqui. Use “+ Lançar conta”.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const sit = payableSituation(r, today);
                return (
                  <tr key={r.id} className={r.status === "cancelada" ? "text-prime-muted line-through" : ""}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{brDate(r.due_date)}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">
                        {r.description}
                        {r.recurrence === "mensal" ? <span className="ml-1 text-xs text-prime-gold">↻ mensal</span> : null}
                      </p>
                      <p className="text-xs text-prime-muted">
                        {[r.supplier, ISSUERS.find((i) => i.id === r.issuer)?.label !== "—" ? ISSUERS.find((i) => i.id === r.issuer)?.label : null, r.notes]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs">{categoryLabel(r.category)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {brl(r.status === "paga" ? Number(r.paid_amount ?? r.amount) : Number(r.amount))}
                      {r.status === "paga" && r.paid_at ? <p className="text-xs font-normal text-prime-muted">pago {brDate(r.paid_at)}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SIT[sit].cls}`}>{SIT[sit].label}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                      {r.status === "aberta" ? (
                        <>
                          <button type="button" disabled={busy} onClick={() => void act(r, "pagar")} className="font-semibold text-emerald-700 hover:underline">
                            Pagar
                          </button>
                          {" · "}
                          <button type="button" disabled={busy} onClick={() => void act(r, "cancelar")} className="text-prime-muted hover:underline">
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void act(r, "reabrir")} className="text-prime-gold hover:underline">
                          Reabrir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-prime-muted">
        O que pagar aos motoristas parceiros fica em Financeiro → Repasses, porque depende do cliente pagar a corrida.
      </p>
    </section>
  );
}
