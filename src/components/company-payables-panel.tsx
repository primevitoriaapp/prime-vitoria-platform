"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FinanceFilesChips } from "@/components/finance-files-chips";
import { uploadFinanceFile } from "@/lib/finance/upload-finance-file";
import type { FinanceFile } from "@/lib/finance/finance-files";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { BoletoReader } from "@/components/boleto-reader";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { inCompany, useCompany, companyLabel } from "@/lib/company/company-context";
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
  const [files, setFiles] = useState<FinanceFile[]>([]);

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
    const old = jb.success ? (jb.data ?? []).filter((r) => r.due_date < `${month}-01`) : [];
    setOverdueOld(old);
    setLoading(false);
    const ids = [...(ja.success ? (ja.data ?? []) : []), ...old].map((r) => r.id);
    if (ids.length) {
      const f = await fetchWithSupabaseSession(`/api/finance/files?entity_type=company_payable&ids=${ids.join(",")}`, {}, "admin");
      const jf = (await f.json().catch(() => ({}))) as { success?: boolean; data?: FinanceFile[] };
      setFiles(jf.success ? (jf.data ?? []) : []);
    } else setFiles([]);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const { company } = useCompany();
  const all = useMemo(() => [...overdueOld, ...rows].filter((r) => inCompany(company, r.issuer)), [overdueOld, rows, company]);
  useEffect(() => {
    setForm((f) => ({ ...f, issuer: company === "todas" ? f.issuer : company }));
  }, [company]);
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

  const [payRow, setPayRow] = useState<Row | null>(null);
  const [pay, setPay] = useState({ amount: "", date: "", method: "pix", account: "", file: null as File | null });
  const [accounts, setAccounts] = useState<{ id: string; label: string | null; bank: string | null }[]>([]);
  useEffect(() => {
    void fetchWithSupabaseSession("/api/finance/bank-accounts", {}, "admin")
      .then((r) => r.json())
      .then((j) => j?.success && setAccounts(((j.data ?? []) as { id: string; label: string | null; bank: string | null; active?: boolean }[]).filter((a) => a.active !== false)))
      .catch(() => undefined);
  }, []);

  function openPay(r: Row) {
    setPayRow(r);
    setPay({ amount: String(r.amount).replace(".", ","), date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()), method: "pix", account: accounts[0]?.id ?? "", file: null });
  }

  /** Dar baixa com comprovante: tudo numa tela, para o pacote do contador sair completo. */
  async function confirmPay() {
    if (!payRow) return;
    if (!pay.file && !window.confirm("Sem comprovante? O pacote do contador vai sair sem ele. Pode anexar depois pelo botão “Anexar”. Continuar?")) return;
    setBusy(true);
    const res = await fetchWithSupabaseSession(
      `/api/finance/company-payables/${payRow.id}`,
      { method: "PATCH", body: JSON.stringify({ action: "pagar", paid_amount: pay.amount, paid_at: pay.date, payment_method: pay.method, bank_account_id: pay.account || null }) },
      "admin"
    );
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { next?: { due_date: string } | null }; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setBusy(false);
      setMsg({ ok: false, text: json.error?.message ?? "Falhou." });
      return;
    }
    let proofErr: string | null = null;
    if (pay.file) {
      try {
        await uploadFinanceFile("company_payable", payRow.id, "comprovante", pay.file);
      } catch (e) {
        proofErr = e instanceof Error ? e.message : "erro";
      }
    }
    setBusy(false);
    setPayRow(null);
    setMsg(
      proofErr
        ? { ok: false, text: `Conta paga, mas o comprovante não subiu (${proofErr}). Use “Anexar” na linha.` }
        : { ok: true, text: `Conta paga${pay.file ? " com comprovante" : ""}.${json.data?.next ? ` A do mês que vem (${brDate(json.data.next.due_date)}) já foi lançada.` : ""}` }
    );
    void load();
  }

  async function act(r: Row, action: "pagar" | "reabrir" | "cancelar") {
    const body: Record<string, unknown> = { action };
    if (action === "pagar") {
      openPay(r);
      return;
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
      text: action === "reabrir" ? "Conta reaberta." : "Conta cancelada."
    });
    void load();
  }

  const monthLabel = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="space-y-4">
      {payRow ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true">
          <div className="grid w-full max-w-md gap-3 rounded-2xl bg-white p-5 shadow-2xl" onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && e.preventDefault()}>
            <p className="text-base font-semibold">Dar baixa: {payRow.description}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm">
                Valor pago
                <input className="prime-input" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                Data do pagamento
                <input type="date" className="prime-input" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                Forma
                <select className="prime-input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  {[
                    ["pix", "PIX"],
                    ["boleto", "Boleto"],
                    ["cartao", "Cartão"],
                    ["transferencia", "Transferência"],
                    ["debito_automatico", "Débito automático"],
                    ["dinheiro", "Dinheiro"]
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Saiu da conta
                <select className="prime-input" value={pay.account} onChange={(e) => setPay({ ...pay, account: e.target.value })}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label || a.bank}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={`grid cursor-pointer gap-1 rounded-xl border-2 border-dashed p-3 text-center text-sm font-semibold ${pay.file ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-amber-400 bg-amber-50 text-amber-900"}`}>
              {pay.file ? `✓ ${pay.file.name}` : "⬆ Anexar comprovante (PDF ou foto)"}
              <input type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => setPay({ ...pay, file: e.target.files?.[0] ?? null })} />
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void confirmPay()} className="flex-1 rounded-xl bg-[#111] py-2.5 text-sm font-bold text-prime-gold disabled:opacity-50">
                {busy ? "Salvando…" : "Confirmar pagamento"}
              </button>
              <button type="button" onClick={() => setPayRow(null)} className="rounded-xl border border-prime-border px-4 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {company !== "todas" ? (
        <p className="rounded-xl bg-[#111] px-4 py-2 text-sm text-[#fff]">
          Mostrando só <b className="text-prime-gold">{companyLabel(company)}</b>. Para ver o grupo inteiro, escolha “Todas as empresas” no topo.
        </p>
      ) : null}
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
          <BoletoReader onFill={(f) => setForm((cur) => ({ ...cur, ...f, issuer: f.issuer ?? cur.issuer, due_date: f.due_date || cur.due_date }))} />
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
                      {r.status !== "cancelada" ? (
                        <FinanceFilesChips
                          entityType="company_payable"
                          entityId={r.id}
                          files={files.filter((f) => f.entity_id === r.id)}
                          onChange={() => void load()}
                          suggest={r.status === "paga" ? "comprovante" : "boleto"}
                        />
                      ) : null}
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
                        <button type="button" disabled={busy} onClick={() => void act(r, "reabrir")} className="text-prime-gold-ink hover:underline">
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
