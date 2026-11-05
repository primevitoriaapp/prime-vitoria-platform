"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { VoucherGroup } from "@/lib/finance/voucher-groups";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dayOnly = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "Concluído", cls: "bg-emerald-50 text-emerald-800" },
  in_progress: { label: "Em viagem", cls: "bg-sky-50 text-sky-800" },
  arrived: { label: "No local", cls: "bg-sky-50 text-sky-800" },
  on_the_way: { label: "A caminho", cls: "bg-sky-50 text-sky-800" }
};
const statusOf = (s: string) => STATUS[s] ?? { label: "Agendado", cls: "bg-prime-bg text-prime-muted" };

function plus30(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

/**
 * Fechamento por voucher (clientes que fecham por serviço, ex.: CEP): escolhe UM NR por vez,
 * confere os serviços (B, C1, C2…), define o vencimento e gera uma fatura com um boleto.
 */
export function VouchersToCloseCard({ onClosed }: { onClosed?: () => void }) {
  const [groups, setGroups] = useState<VoucherGroup[]>([]);
  const [tab, setTab] = useState<"prontos" | "andamento">("prontos");
  const [open, setOpen] = useState<string | null>(null);
  const [due, setDue] = useState(plus30());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession("/api/client-invoices/vouchers", {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { groups: VoucherGroup[] } };
    if (j.success) setGroups(j.data?.groups ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function close(g: VoucherGroup) {
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      "/api/client-invoices/vouchers",
      { method: "POST", body: JSON.stringify({ trip_ids: g.trips.map((t) => t.id), due_date: due, ref: g.ref }) },
      "admin"
    );
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { number: number; trip_ids: string[]; total_amount: number }; error?: { message?: string } };
    setBusy(false);
    if (!r.ok || !j.success || !j.data) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível fechar." });
    setMsg({
      ok: true,
      text: `${g.ref} fechado: fatura ${String(j.data.number).padStart(5, "0")} · ${j.data.trip_ids.length} serviço(s) · ${brl(j.data.total_amount)}. Anexe o boleto na lista de faturas abaixo.`
    });
    setOpen(null);
    await load();
    onClosed?.();
  }

  if (!groups.length) return null;
  const ready = groups.filter((g) => g.ready);
  const pending = groups.filter((g) => !g.ready);
  const list = tab === "prontos" ? ready : pending;

  return (
    <section className="overflow-hidden rounded-2xl border border-prime-border bg-white shadow-prime-card">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-prime-border px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-prime-gold-ink">Fechamento por serviço</p>
          <h3 className="text-lg font-semibold">Serviços a faturar</h3>
          <p className="text-xs text-prime-muted">Clientes que fecham por serviço. Com voucher (NR, ex.: CEP), junta os serviços do mesmo NR; sem voucher (ex.: Seg Pro), junta os serviços do mesmo dia. Um grupo = uma fatura e um boleto.</p>
        </div>
        <div className="inline-flex rounded-xl bg-prime-bg p-1 text-sm">
          {(
            [
              ["prontos", `Prontos para fechar (${ready.length})`],
              ["andamento", `Em andamento (${pending.length})`]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setOpen(null);
              }}
              className={`rounded-lg px-3 py-1.5 ${tab === id ? "bg-white font-semibold shadow-sm" : "text-prime-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {msg ? <p className={`px-5 pt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}

      {list.length === 0 ? (
        <p className="px-5 py-6 text-sm text-prime-muted">
          {tab === "prontos" ? "Nenhum voucher com todos os serviços concluídos ainda." : "Nenhum voucher em andamento."}
        </p>
      ) : (
        <ul className="divide-y divide-prime-border">
          {list.map((g) => {
            const isOpen = open === g.key;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(isOpen ? null : g.key);
                    setDue(plus30());
                    setMsg(null);
                  }}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 text-left transition hover:bg-prime-bg/60 sm:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_110px_110px_auto] ${isOpen ? "bg-prime-bg/60" : ""}`}
                >
                  <span>
                    <span className="block font-semibold">{g.ref}</span>
                    <span className="text-xs text-prime-muted sm:hidden">
                      {g.client_name} · {g.trips.length} serviço(s) · {brl(g.total)}
                    </span>
                  </span>
                  <span className="hidden text-sm text-prime-muted sm:block">{g.client_name}</span>
                  <span className="hidden text-sm sm:block">
                    {g.trips.length} serviço{g.trips.length > 1 ? "s" : ""}
                    <span className="block text-xs text-prime-muted">
                      {dayOnly(g.trips[0].scheduled_at)}
                      {dayOnly(g.last_at) !== dayOnly(g.trips[0].scheduled_at) ? ` a ${dayOnly(g.last_at)}` : ""}
                    </span>
                  </span>
                  <span className="hidden text-right font-semibold sm:block">{brl(g.total)}</span>
                  <span className="flex items-center justify-end gap-2">
                    {g.ready ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Pronto</span>
                    ) : g.pending === 0 && g.to_approve > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">Aprovar {g.to_approve}</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">Faltam {g.pending}</span>
                    )}
                    <span className="text-prime-muted">{isOpen ? "▴" : "▾"}</span>
                  </span>
                </button>

                {isOpen ? (
                  <div className="grid gap-4 bg-prime-bg/40 px-5 pb-5 pt-2">
                    <div className="overflow-hidden rounded-xl border border-prime-border bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-prime-bg text-left text-[11px] uppercase tracking-wide text-prime-muted">
                            <th className="px-3 py-2">Serviço</th>
                            <th className="px-3 py-2">Data</th>
                            <th className="px-3 py-2">Situação</th>
                            <th className="px-3 py-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.trips.map((t) => (
                            <tr key={t.id} className="border-t border-prime-border">
                              <td className="px-3 py-2">
                                <a href={`/agenda?trip=${t.id}`} className="font-medium hover:underline">
                                  {t.ref}
                                </a>
                              </td>
                              <td className="px-3 py-2 text-prime-muted">{when(t.scheduled_at)}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusOf(t.operational_status).cls}`}>{statusOf(t.operational_status).label}</span>
                              </td>
                              <td className="px-3 py-2 text-right">{t.client_amount != null ? brl(t.client_amount) : <span className="text-red-700">sem valor</span>}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-prime-border bg-prime-bg/50">
                            <td className="px-3 py-2 font-semibold" colSpan={3}>
                              Total do voucher
                            </td>
                            <td className="px-3 py-2 text-right font-bold">{brl(g.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap items-end justify-between gap-3">
                      {g.has_voucher_file ? (
                        <a
                          href={`/api/trips/${g.trips.find((t) => t.has_voucher)?.id}/client-voucher`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-prime-border hover:ring-prime-gold"
                        >
                          🧾 Ver voucher do cliente
                        </a>
                      ) : (
                        <span className="text-xs text-prime-muted">Voucher em PDF não guardado (anexe na corrida, se precisar).</span>
                      )}
                      {g.ready ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="grid gap-1 text-xs text-prime-muted">
                            Vencimento do boleto
                            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-lg border border-prime-border bg-white px-3 py-2 text-sm text-prime-text" />
                          </label>
                          <button
                            type="button"
                            disabled={busy || !due}
                            onClick={() => void close(g)}
                            className="rounded-lg bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#C9A84C] disabled:opacity-50"
                          >
                            {busy ? "Fechando…" : `Fechar ${g.ref} · ${brl(g.total)}`}
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-900">
                          {g.pending === 0 && g.to_approve > 0 ? (
                            <>
                              Falta aprovar {g.to_approve} serviço(s) em{" "}
                              <a href="/conferencia" className="font-semibold underline">
                                Aprovar corridas
                              </a>
                              .
                            </>
                          ) : (
                            "Fecha quando todos os serviços estiverem concluídos."
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
