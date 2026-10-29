"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { COMPANY_SCOPES, inCompany, useCompany } from "@/lib/company/company-context";

type Row = { id: string; description: string; category: string; payer: string | null; amount: number; due_date: string; status: string; received_at: string | null; issuer: string | null };

const CATS: Record<string, string> = {
  locacao: "Locação de veículo",
  servico_avulso: "Serviço avulso",
  reembolso: "Reembolso",
  venda_ativo: "Venda de veículo/bem",
  rendimento: "Rendimento financeiro",
  outros: "Outros"
};
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Receitas que não vêm de corrida: entram na DRE, no caixa e na previsão. */
export function OtherIncomesPanel() {
  const { company } = useCompany();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ description: "", category: "locacao", payer: "", amount: "", due_date: today(), issuer: company === "todas" ? "rj_prime" : company, received: false });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession("/api/finance/other-incomes", {}, "admin");
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Row[] };
    if (j.success) setRows(j.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const res = await fetchWithSupabaseSession("/api/finance/other-incomes", { method: "POST", body: JSON.stringify({ ...f, payer: f.payer || null }) }, "admin");
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    if (!j.success) return setMsg(j.error?.message ?? "Confira os campos.");
    setMsg("Receita lançada.");
    setOpen(false);
    setF({ ...f, description: "", payer: "", amount: "", received: false });
    void load();
  }

  async function act(id: string, action: "receber" | "reabrir" | "cancelar") {
    await fetchWithSupabaseSession(`/api/finance/other-incomes/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }, "admin");
    void load();
  }

  const list = rows.filter((r) => inCompany(company, r.issuer));
  const openTotal = list.filter((r) => r.status === "aberta").reduce((s, r) => s + Number(r.amount), 0);

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Outras receitas</h2>
          <p className="text-xs text-prime-muted">Locação, serviço avulso, reembolso, venda de veículo… Entram na DRE, no caixa e na previsão.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>
          + Lançar receita
        </button>
      </div>
      {msg ? <p className="mt-2 rounded-lg bg-prime-bg px-3 py-2 text-sm">{msg}</p> : null}
      {open ? (
        <div className="mt-3 grid gap-3 rounded-xl bg-prime-bg p-3 sm:grid-cols-6">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>Descrição</span>
            <input className={PRIME_INPUT_CLASS} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: Locação Onix para Fulano – nov" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Tipo</span>
            <select className={PRIME_INPUT_CLASS} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {Object.entries(CATS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Quem paga</span>
            <input className={PRIME_INPUT_CLASS} value={f.payer} onChange={(e) => setF({ ...f, payer: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Valor (R$)</span>
            <input className={PRIME_INPUT_CLASS} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.,]/g, "") })} placeholder="0,00" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Vencimento</span>
            <input type="date" className={PRIME_INPUT_CLASS} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Empresa</span>
            <select className={PRIME_INPUT_CLASS} value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })}>
              {COMPANY_SCOPES.filter((c) => c.id !== "todas").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" checked={f.received} onChange={(e) => setF({ ...f, received: e.target.checked })} />
            Já recebi (dar baixa agora)
          </label>
          <div className="sm:col-span-2 sm:text-right">
            <button type="button" className="btn-primary" onClick={() => void save()}>
              Salvar
            </button>
          </div>
        </div>
      ) : null}
      {list.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {list.slice(0, 30).map((r) => (
                <tr key={r.id} className="border-t border-prime-border">
                  <td className="py-2">{r.due_date.split("-").reverse().join("/")}</td>
                  <td className="py-2">
                    <span className="font-medium">{r.description}</span>
                    <span className="block text-xs text-prime-muted">
                      {CATS[r.category] ?? r.category}
                      {r.payer ? ` · ${r.payer}` : ""}
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold">{brl(r.amount)}</td>
                  <td className="py-2 text-right text-xs">
                    {r.status === "recebida" ? (
                      <button type="button" className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800" onClick={() => void act(r.id, "reabrir")} title="Reabrir">
                        Recebida
                      </button>
                    ) : (
                      <span className="flex justify-end gap-2">
                        <button type="button" className="rounded-lg bg-emerald-600 px-2 py-1 font-semibold text-[#fff]" onClick={() => void act(r.id, "receber")}>
                          Recebi
                        </button>
                        <button type="button" className="text-red-700" onClick={() => void act(r.id, "cancelar")}>
                          Excluir
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {openTotal ? <p className="mt-2 text-xs text-prime-muted">A receber: {brl(openTotal)}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
