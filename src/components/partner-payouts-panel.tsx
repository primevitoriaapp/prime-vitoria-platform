"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { payoutStatementText, type PayoutGroup } from "@/lib/finance/partner-payouts";

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const todaySp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const KIND: Record<string, { label: string; cls: string }> = {
  PJ: { label: "Empresa parceira", cls: "bg-[#111] text-prime-gold" },
  PF: { label: "Parceiro PF", cls: "bg-amber-100 text-amber-900" },
  avulso: { label: "Motorista", cls: "bg-prime-bg text-prime-muted" }
};

function downloadCsv(name: string, g: PayoutGroup) {
  const rows = [["Data", "Cliente", "Trajeto", "Motorista", "Situação", "Valor"]].concat(
    g.rows.map((r) => [when(r.trip_at), r.client_name, r.route, r.driver_name, r.status === "paid" ? "Pago" : r.released ? "Liberado" : "Aguardando cliente", r.amount.toFixed(2).replace(".", ",")])
  );
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Financeiro → repasses agrupados por parceiro: um extrato e um pagamento por empresa. */
export function PartnerPayoutsPanel() {
  const [view, setView] = useState<"abertos" | "pagos">("abertos");
  const [month, setMonth] = useState(todaySp().slice(0, 7));
  const [groups, setGroups] = useState<PayoutGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const qs = view === "pagos" ? `?visao=pagos&from=${month}-01&to=${month}-${String(last).padStart(2, "0")}` : "";
    const res = await fetchWithSupabaseSession(`/api/finance/partner-payouts${qs}`, {}, "admin");
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { groups: PayoutGroup[] } };
    setGroups(j.success ? (j.data?.groups ?? []) : []);
    setLoading(false);
  }, [view, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const sum = useMemo(
    () => groups.reduce((s, g) => ({ released: s.released + g.released, waiting: s.waiting + g.waiting, paid: s.paid + g.paid }), { released: 0, waiting: 0, paid: 0 }),
    [groups]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-prime-border bg-white p-1 text-sm">
          {(
            [
              ["abertos", "A pagar"],
              ["pagos", "Pagos"]
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={`rounded-lg px-3 py-1 ${view === id ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        {view === "pagos" ? <input type="month" className={PRIME_INPUT_CLASS} value={month} onChange={(e) => setMonth(e.target.value)} /> : null}
      </div>

      {view === "abertos" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#111] bg-[#111] p-4">
            <p className="text-xs text-prime-gold">Liberado para pagar (cliente já pagou)</p>
            <p className="mt-1 text-2xl font-semibold text-[#fff]">{brl(sum.released)}</p>
          </div>
          <div className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
            <p className="text-xs text-prime-muted">Aguardando o cliente pagar a Prime</p>
            <p className="mt-1 text-2xl font-semibold">{brl(sum.waiting)}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
          <p className="text-xs text-prime-muted">Pago no mês</p>
          <p className="mt-1 text-2xl font-semibold">{brl(sum.paid)}</p>
        </div>
      )}

      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl border border-prime-border bg-white" />
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">
          {view === "abertos" ? "Nenhum repasse em aberto." : "Nenhum repasse pago neste mês."}
        </p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <PayoutGroupCard
              key={g.key}
              g={g}
              view={view}
              expanded={open === g.key}
              onToggle={() => setOpen((v) => (v === g.key ? null : g.key))}
              onPaid={(text) => {
                setMsg({ ok: true, text });
                void load();
              }}
              onError={(text) => setMsg({ ok: false, text })}
            />
          ))}
        </ul>
      )}
      <p className="text-xs text-prime-muted">
        O motorista entra no grupo da empresa parceira quando está vinculado a ela em Parceiros. Sem vínculo, aparece sozinho. Repasse só fica liberado depois que o cliente paga a Prime.
      </p>
    </div>
  );
}

function PayoutGroupCard({
  g,
  view,
  expanded,
  onToggle,
  onPaid,
  onError
}: {
  g: PayoutGroup;
  view: "abertos" | "pagos";
  expanded: boolean;
  onToggle: () => void;
  onPaid: (text: string) => void;
  onError: (text: string) => void;
}) {
  const openRows = g.rows.filter((r) => r.status !== "paid");
  const [sel, setSel] = useState<Set<string>>(() => new Set(openRows.filter((r) => r.released).map((r) => r.id)));
  const [paying, setPaying] = useState(false);
  const [paidOn, setPaidOn] = useState(todaySp());
  const [method, setMethod] = useState("pix");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const selTotal = Math.round(openRows.filter((r) => sel.has(r.id)).reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const k = KIND[g.kind] ?? KIND.avulso;

  async function pay() {
    setBusy(true);
    const res = await fetchWithSupabaseSession(
      "/api/finance/partner-payouts/pay",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payable_ids: [...sel], paid_on: paidOn, payment_method: method, owner_name: g.name }) },
      "admin"
    );
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { paid: number; total: number }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !j.success) return onError(j.error?.message ?? "Não foi possível registrar o pagamento.");
    setPaying(false);
    onPaid(`${g.name}: ${j.data?.paid ?? 0} repasse(s) pagos, total ${brl(j.data?.total ?? 0)}.`);
  }

  return (
    <li className="rounded-2xl border border-prime-border bg-white shadow-prime-card">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
        <span className="min-w-0">
          <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.cls}`}>{k.label}</span>
          <span className="font-semibold">{g.name}</span>
          <span className="mt-0.5 block truncate text-xs text-prime-muted">
            {g.rows.length} serviço(s) · {g.drivers.join(", ")}
            {g.pix_key ? ` · PIX ${g.pix_key}` : " · sem PIX cadastrado"}
          </span>
        </span>
        <span className="text-right">
          {view === "abertos" ? (
            <>
              <span className="block text-lg font-semibold">{brl(g.released)}</span>
              <span className="block text-xs text-prime-muted">{g.waiting > 0 ? `+ ${brl(g.waiting)} aguardando cliente` : "liberado"}</span>
            </>
          ) : (
            <span className="block text-lg font-semibold">{brl(g.paid)}</span>
          )}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-prime-border p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-prime-muted">
                  {view === "abertos" ? <th className="w-8 py-2" /> : null}
                  <th className="py-2">Data</th>
                  <th className="py-2">Cliente / trajeto</th>
                  <th className="py-2">Motorista</th>
                  <th className="py-2">Situação</th>
                  <th className="py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id} className="border-t border-prime-border">
                    {view === "abertos" ? (
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={sel.has(r.id)}
                          onChange={(e) =>
                            setSel((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(r.id);
                              else n.delete(r.id);
                              return n;
                            })
                          }
                        />
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap py-2">{when(r.trip_at)}</td>
                    <td className="py-2">
                      <span className="font-medium">{r.client_name}</span>
                      <span className="block text-xs text-prime-muted">{r.route}</span>
                    </td>
                    <td className="py-2">{r.driver_name}</td>
                    <td className="py-2 text-xs">
                      {r.status === "paid" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Pago {r.paid_at ? new Date(r.paid_at).toLocaleDateString("pt-BR") : ""}</span>
                      ) : r.released ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">Liberado</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">Aguardando cliente</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-semibold">{brl(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {view === "abertos" ? (
              <>
                <span className="mr-auto text-sm">
                  Selecionado: <strong>{brl(selTotal)}</strong> ({sel.size})
                </span>
                <button
                  type="button"
                  className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-prime-border hover:ring-prime-gold"
                  onClick={() => {
                    void navigator.clipboard?.writeText(payoutStatementText(g, sel.size ? sel : undefined)).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                >
                  {copied ? "Extrato copiado" : "Copiar extrato (WhatsApp)"}
                </button>
              </>
            ) : (
              <span className="mr-auto" />
            )}
            <button type="button" className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => downloadCsv(`repasse_${g.name.replace(/\W+/g, "_")}.csv`, g)}>
              Baixar planilha
            </button>
            {view === "abertos" ? (
              <button type="button" disabled={!sel.size} className="btn-primary disabled:opacity-40" onClick={() => setPaying(true)}>
                Registrar pagamento
              </button>
            ) : null}
          </div>

          {paying ? (
            <div className="mt-3 grid gap-3 rounded-xl bg-prime-bg p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="grid gap-1 text-sm">
                <span>Data do pagamento</span>
                <input type="date" className={PRIME_INPUT_CLASS} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Forma</span>
                <select className={PRIME_INPUT_CLASS} value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="pix">PIX</option>
                  <option value="ted">TED / transferência</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </label>
              <span className="flex gap-2">
                <button type="button" className="rounded-lg px-3 py-2 text-sm ring-1 ring-prime-border" onClick={() => setPaying(false)}>
                  Cancelar
                </button>
                <button type="button" disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-[#fff] disabled:opacity-50" onClick={() => void pay()}>
                  {busy ? "Salvando…" : `Pagar ${brl(selTotal)}`}
                </button>
              </span>
              {openRows.some((r) => sel.has(r.id) && !r.released) ? (
                <p className="text-xs text-amber-800 sm:col-span-3">Atenção: há serviço selecionado cujo cliente ainda não pagou a Prime.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
