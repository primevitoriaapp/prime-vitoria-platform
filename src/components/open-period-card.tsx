"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Trip = {
  id: string;
  scheduled_at: string;
  stage: "aprovada" | "aprovar" | "agendada";
  ref: string | null;
  driver: string | null;
  passenger: string | null;
  route: string;
  km: number | null;
  client_amount: number | null;
  driver_amount: number | null;
};
type Group = {
  client_id: string;
  client_name: string;
  billing: string;
  approved_total: number;
  approved_count: number;
  to_approve_total: number;
  to_approve_count: number;
  upcoming_count: number;
  upcoming_total: number;
  driver_total: number;
  trips: Trip[];
};

const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const STAGE = {
  aprovada: { label: "✓ Aprovada", cls: "bg-emerald-50 text-emerald-800" },
  aprovar: { label: "Falta aprovar", cls: "bg-amber-50 text-amber-900" },
  agendada: { label: "Agendada", cls: "bg-prime-bg text-prime-muted" }
} as const;
function thisMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
}

/** Conta corrente do mês: o que cada cliente já acumulou e ainda não foi faturado. */
export function OpenPeriodCard() {
  const [month, setMonth] = useState(thisMonth());
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setGroups(null);
    const r = await fetchWithSupabaseSession(`/api/client-invoices/open-period?month=${month}`, {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { clients: Group[] } };
    setGroups(j.success ? (j.data?.clients ?? []) : []);
  }, [month]);
  useEffect(() => {
    void load();
  }, [load]);

  const tot = (groups ?? []).reduce((s, g) => s + g.approved_total + g.to_approve_total, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-prime-border bg-white shadow-prime-card">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-prime-border px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-prime-gold-ink">Conta corrente do mês</p>
          <h3 className="text-lg font-semibold">Acumulado por cliente (ainda não faturado)</h3>
          <p className="text-xs text-prime-muted">
            Tudo que cada empresa já usou no mês. No fechamento, as corridas aprovadas viram a fatura. Até lá, acompanhe aqui.
          </p>
        </div>
        <label className="grid gap-1 text-xs text-prime-muted">
          Mês
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-prime-border px-3 py-1.5 text-sm text-prime-text" />
        </label>
      </header>
      {groups == null ? (
        <p className="px-5 py-6 text-sm text-prime-muted">Carregando…</p>
      ) : groups.length === 0 ? (
        <p className="px-5 py-6 text-sm text-prime-muted">Nenhuma corrida em aberto neste mês.</p>
      ) : (
        <>
          <p className="px-5 pt-3 text-sm">
            Total realizado e ainda não faturado: <b>{brl(Math.round(tot * 100) / 100)}</b>
          </p>
          <ul className="divide-y divide-prime-border">
            {groups.map((g) => {
              const isOpen = open === g.client_id;
              return (
                <li key={g.client_id}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : g.client_id)}
                    className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 text-left hover:bg-prime-bg/60 sm:grid-cols-[minmax(160px,1fr)_130px_130px_130px_auto] ${isOpen ? "bg-prime-bg/60" : ""}`}
                  >
                    <span>
                      <span className="block font-semibold">{g.client_name}</span>
                      <span className="text-xs text-prime-muted">{g.billing}</span>
                    </span>
                    <span className="hidden text-sm sm:block">
                      <span className="block text-xs text-prime-muted">Aprovadas ({g.approved_count})</span>
                      <b>{brl(g.approved_total)}</b>
                    </span>
                    <span className="hidden text-sm sm:block">
                      <span className="block text-xs text-prime-muted">Falta aprovar ({g.to_approve_count})</span>
                      <b className={g.to_approve_count ? "text-amber-800" : ""}>{brl(g.to_approve_total)}</b>
                    </span>
                    <span className="hidden text-sm sm:block">
                      <span className="block text-xs text-prime-muted">Agendadas ({g.upcoming_count})</span>
                      <b>{brl(g.upcoming_total)}</b>
                    </span>
                    <span className="flex items-center gap-2 text-right">
                      <span className="text-sm sm:hidden">
                        <b>{brl(g.approved_total + g.to_approve_total)}</b>
                      </span>
                      <span className="text-prime-muted">{isOpen ? "▴" : "▾"}</span>
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="grid gap-3 bg-prime-bg/40 px-5 pb-5 pt-2">
                      <div className="overflow-x-auto rounded-xl border border-prime-border bg-white">
                        <table className="w-full min-w-[640px] text-sm">
                          <thead>
                            <tr className="bg-prime-bg text-left text-[11px] uppercase tracking-wide text-prime-muted">
                              <th className="px-3 py-2">Data</th>
                              <th className="px-3 py-2">Trajeto</th>
                              <th className="px-3 py-2">Motorista</th>
                              <th className="px-3 py-2 text-right">KM</th>
                              <th className="px-3 py-2">Situação</th>
                              <th className="px-3 py-2 text-right">Cliente</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.trips.map((t) => (
                              <tr key={t.id} className="border-t border-prime-border">
                                <td className="whitespace-nowrap px-3 py-2">
                                  <a href={`/agenda?trip=${t.id}`} className="font-medium hover:underline">
                                    {when(t.scheduled_at)}
                                  </a>
                                  {t.ref ? <span className="block text-[11px] text-prime-muted">{t.ref}</span> : null}
                                </td>
                                <td className="px-3 py-2">
                                  {t.route}
                                  {t.passenger ? <span className="block text-[11px] text-prime-muted">{t.passenger}</span> : null}
                                </td>
                                <td className="px-3 py-2">{t.driver ?? "—"}</td>
                                <td className="px-3 py-2 text-right">{t.km != null ? t.km.toLocaleString("pt-BR") : "—"}</td>
                                <td className="px-3 py-2">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE[t.stage].cls}`}>{STAGE[t.stage].label}</span>
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">{brl(t.client_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          Já realizado: <b>{brl(Math.round((g.approved_total + g.to_approve_total) * 100) / 100)}</b> · repasse aos motoristas {brl(g.driver_total)} · margem{" "}
                          <b>{brl(Math.round((g.approved_total + g.to_approve_total - g.driver_total) * 100) / 100)}</b>
                        </span>
                        {g.to_approve_count ? (
                          <a href="/conferencia" className="font-semibold text-amber-800 underline">
                            Aprovar {g.to_approve_count} corrida(s) →
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
