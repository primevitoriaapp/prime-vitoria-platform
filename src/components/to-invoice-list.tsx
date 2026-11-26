"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { splitBaseRef } from "@/lib/finance/merge-split-services";

type Trip = {
  id: string;
  client_id: string;
  scheduled_at: string;
  ref: string | null;
  ref_base: string | null;
  passenger: string | null;
  driver: string | null;
  route: string;
  amount: number | null;
  has_voucher: boolean;
  merge_key: string | null;
  cancel_charge: string | null;
  invoice: { id: string; number: number; status: string } | null;
};
type Client = { id: string; name: string; payment_term_days: number; per_service: boolean; waiting: number };
type Data = { clients: Client[]; trips: Trip[]; billed: Trip[] };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const CANCEL: Record<string, string> = { no_show: "NO-SHOW", cancelamento_tardio: "CANCELAMENTO", outro: "TAXA CANCEL." };

/**
 * "A faturar" no estilo Omie: todas as corridas prontas para cobrar, por cliente.
 * Você marca quais entram e fecha. Nada é juntado ou fechado sozinho.
 */
export function ToInvoiceList({ onClosed }: { onClosed?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [client, setClient] = useState<string>("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (search: string) => {
    const r = await fetchWithSupabaseSession(`/api/client-invoices/to-invoice${search.trim().length >= 3 ? `?q=${encodeURIComponent(search.trim())}` : ""}`, {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (j?.success) setD(j.data as Data);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(q), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const trips = useMemo(() => {
    const list = d?.trips ?? [];
    const f = norm(q.trim()).replace(/^nr\s*/, "");
    return list.filter((t) => (!client || t.client_id === client) && (!f || norm(`${t.ref ?? ""} ${t.passenger ?? ""} ${t.route} ${t.driver ?? ""}`).includes(f)));
  }, [d, q, client]);

  const byClient = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const t of trips) m.set(t.client_id, [...(m.get(t.client_id) ?? []), t]);
    return m;
  }, [trips]);

  const clientsOf = (d?.clients ?? []).filter((c) => (d?.trips ?? []).some((t) => t.client_id === c.id) || c.waiting > 0);
  const picked = (d?.trips ?? []).filter((t) => sel.has(t.id));
  const pickedClients = [...new Set(picked.map((t) => t.client_id))];
  const pickedTotal = picked.reduce((s, t) => s + Number(t.amount ?? 0), 0);

  function toggle(ids: string[], on: boolean) {
    const n = new Set(sel);
    for (const id of ids) {
      if (on) n.add(id);
      else n.delete(id);
    }
    setSel(n);
  }

  async function close() {
    if (!picked.length) return;
    if (pickedClients.length > 1) return setMsg({ ok: false, text: "Marque corridas de um cliente só (cada cliente tem a sua fatura)." });
    const c = (d?.clients ?? []).find((x) => x.id === pickedClients[0]);
    const noValue = picked.filter((t) => !t.amount);
    if (noValue.length) return setMsg({ ok: false, text: `${noValue.length} corrida(s) marcada(s) estão sem valor. Corrija o valor antes de fechar.` });
    const bases = [...new Set(picked.map((t) => t.ref_base).filter(Boolean))] as string[];
    const suggestedRef = bases.length === 1 ? bases[0] : "";
    const ref = window.prompt(
      `Fechar fatura de ${c?.name ?? "cliente"}\n${picked.length} corrida(s) · ${brl(pickedTotal)}\n\nReferência da fatura (NR/O.S. — como o cliente reconhece). Deixe em branco se não tiver:`,
      suggestedRef
    );
    if (ref === null) return;
    const dueDefault = ymd(new Date(Date.now() + (c?.payment_term_days ?? 30) * 86400000));
    const due = window.prompt("Vencimento (AAAA-MM-DD):", dueDefault);
    if (due === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due.trim())) return setMsg({ ok: false, text: "Vencimento inválido. Use o formato 2026-12-31." });

    setClosing(true);
    setMsg(null);
    // Disponível dividido em trechos (NR-B1 + NR-B2): pergunta se sai como um item só.
    const groups = new Map<string, Trip[]>();
    for (const t of picked) {
      const b = splitBaseRef(t.ref);
      if (b) groups.set(b, [...(groups.get(b) ?? []), t]);
    }
    for (const [base, parts] of groups) {
      if (parts.length < 2) continue;
      const soma = parts.reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const juntar = window.confirm(
        `${parts.map((p) => `${p.ref} (${when(p.scheduled_at)}) ${brl(Number(p.amount ?? 0))}`).join("\n")}\n\nEsses trechos são um DISPONÍVEL (diária) que foi dividido?\n\nOK = juntar na fatura como um item só: ${base} · ${brl(soma)}\nCancelar = deixar cada trecho separado`
      );
      await fetchWithSupabaseSession("/api/client-invoices/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_ids: parts.map((p) => p.id), key: juntar ? null : "-" }) }, "admin").catch(() => null);
    }
    const r = await fetchWithSupabaseSession(
      "/api/client-invoices/vouchers",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_ids: picked.map((t) => t.id), due_date: due.trim(), ...(ref.trim() ? { ref: ref.trim() } : {}) }) },
      "admin"
    ).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setClosing(false);
    if (!r?.ok || !j?.success) return setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível fechar." });
    onClosed?.();
    window.location.href = `/finance/faturas/${j.data.invoice_id}?nova=1`;
  }

  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const totalAll = trips.reduce((s, t) => s + Number(t.amount ?? 0), 0);

  return (
    <section className="grid gap-3 pb-24">
      <div className="grid gap-2 rounded-2xl border border-prime-border bg-white p-3 shadow-prime-card">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar NR, passageiro, motorista, endereço…"
            className="min-w-0 flex-1 rounded-xl border border-prime-border px-3 py-2 text-base md:text-sm"
          />
          <span className="text-sm">
            {trips.length} corrida(s) · <b>{brl(totalAll)}</b>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setClient("")} className={`rounded-full px-3 py-1 text-xs font-semibold ${!client ? "bg-[#111] text-[#D9BC6A]" : "bg-prime-bg ring-1 ring-prime-border"}`}>
            Todos
          </button>
          {clientsOf.map((c) => {
            const n = (d.trips ?? []).filter((t) => t.client_id === c.id).length;
            return (
              <button key={c.id} type="button" onClick={() => setClient(client === c.id ? "" : c.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${client === c.id ? "bg-[#111] text-[#D9BC6A]" : "bg-prime-bg ring-1 ring-prime-border"}`}>
                {c.name} · {n}
                {c.waiting ? <span className="ml-1 text-amber-700">(+{c.waiting} a aprovar)</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {msg ? <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      {[...byClient.entries()].map(([cid, list]) => {
        const c = d.clients.find((x) => x.id === cid);
        const allOn = list.every((t) => sel.has(t.id));
        const sum = list.reduce((s, t) => s + Number(t.amount ?? 0), 0);
        const refs = [...new Set(list.map((t) => t.ref_base).filter(Boolean))] as string[];
        return (
          <div key={cid} className="overflow-hidden rounded-2xl border border-prime-border bg-white shadow-prime-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-prime-border bg-prime-bg px-3 py-2">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={allOn} onChange={(e) => toggle(list.map((t) => t.id), e.target.checked)} />
                {c?.name ?? "Cliente"}
              </label>
              <span className="text-sm">
                {list.length} corrida(s) · <b>{brl(sum)}</b>
                {c?.waiting ? <span className="ml-2 text-xs text-amber-800">+{c.waiting} esperando aprovação</span> : null}
              </span>
            </div>
            {refs.length > 1 ? (
              <div className="flex flex-wrap gap-1.5 border-b border-prime-border px-3 py-2 text-xs">
                <span className="text-prime-muted">Marcar a NR:</span>
                {refs.map((r) => {
                  const ids = list.filter((t) => t.ref_base === r).map((t) => t.id);
                  const on = ids.every((id) => sel.has(id));
                  return (
                    <button key={r} type="button" onClick={() => toggle(ids, !on)} className={`rounded-full px-2.5 py-0.5 font-semibold ${on ? "bg-[#111] text-[#D9BC6A]" : "ring-1 ring-prime-border"}`}>
                      {r} ({ids.length})
                    </button>
                  );
                })}
              </div>
            ) : null}
            <ul className="divide-y divide-prime-border">
              {list.map((t) => (
                <li key={t.id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2 text-sm ${sel.has(t.id) ? "bg-[#FFFDF7]" : ""}`}>
                  <input type="checkbox" className="mt-1" checked={sel.has(t.id)} onChange={(e) => toggle([t.id], e.target.checked)} />
                  <a href={`/agenda?trip=${t.id}#trip-detail`} className="min-w-0 hover:underline">
                    <span className="font-semibold">{when(t.scheduled_at)}</span>
                    {t.ref ? <span className="ml-2 rounded bg-[#111] px-1.5 py-0.5 text-[11px] font-semibold text-[#D9BC6A]">{t.ref}</span> : null}
                    {t.cancel_charge ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">{CANCEL[t.cancel_charge] ?? "COBRADA"}</span> : null}
                    {t.has_voucher ? " 📎" : ""}
                    <span className="block truncate text-xs text-prime-muted">
                      {t.passenger ?? "Sem passageiro"} · {t.route}
                      {t.driver ? ` · ${t.driver}` : ""}
                    </span>
                  </a>
                  <span className={`text-right font-semibold tabular-nums ${t.amount ? "" : "text-red-700"}`}>{t.amount ? brl(t.amount) : "sem valor"}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {!trips.length ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-prime-muted">Nada a faturar{q ? " com essa busca" : ""}.</p> : null}

      {d.billed.length ? (
        <div className="rounded-2xl border border-prime-border bg-white p-3 text-sm">
          <p className="mb-1 font-semibold">Já faturadas (resultado da busca)</p>
          <ul className="grid gap-1">
            {d.billed.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-prime-bg px-2 py-1.5">
                <span className="min-w-0">
                  {when(t.scheduled_at)} · {t.ref ?? "sem NR"} · {t.passenger ?? ""}
                  <span className="block truncate text-xs text-prime-muted">{t.route}</span>
                </span>
                {t.invoice ? (
                  <a href={`/finance/faturas/${t.invoice.id}`} className="shrink-0 text-xs font-semibold text-prime-gold-ink">
                    já na fatura nº {t.invoice.number} ({t.invoice.status}) ›
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {picked.length ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-prime-border bg-white/95 px-4 py-3 shadow-2xl backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              <b>{picked.length}</b> marcada(s) · <b>{brl(pickedTotal)}</b>
              {pickedClients.length > 1 ? <span className="ml-2 text-red-700">— de {pickedClients.length} clientes: marque um só</span> : null}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setSel(new Set())} className="rounded-xl px-3 py-2 text-sm ring-1 ring-prime-border">
                Limpar
              </button>
              <button type="button" disabled={closing || pickedClients.length !== 1} onClick={() => void close()} className="rounded-xl bg-[#111] px-4 py-2 text-sm font-semibold text-prime-gold disabled:opacity-40">
                {closing ? "Fechando…" : "Fechar fatura com as marcadas →"}
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
