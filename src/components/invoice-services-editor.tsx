"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { groupSplitItems, isSplitGroup, splitBaseRef } from "@/lib/finance/merge-split-services";

type Row = { id: string; scheduled_at: string; passenger: string | null; ref: string | null; origin: string; destination: string; client_amount: number | null; driver_amount: number | null; merge_key?: string | null };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const money = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));
const parse = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const short = (s: string) => s.split(" - ")[0].split(",")[0].trim().slice(0, 40);

/** Corrigir valores das corridas dentro da fatura (o total da fatura se refaz sozinho). */
export function InvoiceServicesEditor({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const [client, setClient] = useState("");
  const [driver, setDriver] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const locked = status === "paga" || status === "cancelada";

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/client-invoices/${invoiceId}/services`, {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (j?.success) setRows(j.data as Row[]);
  }, [invoiceId]);
  useEffect(() => {
    void load();
  }, [load]);

  function start(r: Row) {
    setEdit(r.id);
    setClient(money(r.client_amount));
    setDriver(money(r.driver_amount));
    setMsg(null);
  }

  async function save(r: Row) {
    setBusy(true);
    const res = await fetchWithSupabaseSession(
      `/api/client-invoices/${invoiceId}/services`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_id: r.id, client_amount: parse(client), driver_amount: driver.trim() ? parse(driver) : null }) },
      "admin"
    ).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !j?.success) return setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível salvar." });
    setEdit(null);
    setMsg({
      ok: true,
      text: `Valor corrigido. Novo total da fatura: ${brl(Number(j.data.invoice_total))}.${j.data.sent ? " Esta fatura já tinha sido enviada: envie de novo para o cliente receber o valor certo." : ""}${j.data.payout_note ? ` ${j.data.payout_note}` : ""}`
    });
    await load();
    router.refresh();
  }

  async function merge(ids: string[], key: string | null, okText: string) {
    setBusy(true);
    const res = await fetchWithSupabaseSession("/api/client-invoices/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_ids: ids, key }) }, "admin").catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !j?.success) return setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível." });
    setPick(new Set());
    setMsg({ ok: true, text: okText });
    await load();
    router.refresh();
  }

  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + Number(r.client_amount ?? 0), 0);
  const items = groupSplitItems(rows, (r) => r.ref, (r) => r.merge_key);
  const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <>
    {rows.length >= 2 ? (
      <section className="grid gap-3 rounded-2xl border border-prime-gold bg-white p-4 shadow-prime-card">
        <div>
          <h3 className="font-semibold">🔗 Como os serviços aparecem para o cliente</h3>
          <p className="text-xs text-prime-muted">
            Disponível (diária) que vocês dividiram em ida e volta: marque os trechos e junte. Na fatura sai <b>um item só</b>, com o valor somado. As corridas e o pagamento dos motoristas continuam separados.
          </p>
        </div>
        <ul className="grid gap-1.5 text-sm">
          {items.map((x) =>
            isSplitGroup(x) ? (
              <li key={x.base} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                <span className="min-w-0">
                  ✓ <b>{x.base}</b> · um item só: {x.parts.map((p) => `${p.ref ?? ""} (${when(p.scheduled_at)})`).join(" + ")} ·{" "}
                  <b>{brl(x.parts.reduce((s2, p) => s2 + Number(p.client_amount ?? 0), 0))}</b>
                </span>
                {!locked ? (
                  <button type="button" disabled={busy} onClick={() => void merge(x.parts.map((p) => p.id), "-", "Pronto: os trechos voltaram a sair separados na fatura.")} className="text-xs font-semibold text-red-700 underline">
                    Separar
                  </button>
                ) : null}
              </li>
            ) : (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-1.5 ring-1 ring-prime-border">
                <label className="flex min-w-0 items-center gap-2">
                  {!locked ? (
                    <input
                      type="checkbox"
                      checked={pick.has(x.id)}
                      onChange={(e) => {
                        const n = new Set(pick);
                        if (e.target.checked) n.add(x.id);
                        else n.delete(x.id);
                        setPick(n);
                      }}
                    />
                  ) : null}
                  <span className="min-w-0">
                    {when(x.scheduled_at)} · {x.ref ?? "sem NR"}
                    {x.passenger ? ` · ${x.passenger}` : ""} · {x.client_amount == null ? "sem valor" : brl(x.client_amount)}
                  </span>
                </label>
                {x.merge_key === "-" && !locked ? (
                  <button type="button" disabled={busy} onClick={() => void merge([x.id], null, "Voltou ao automático.")} className="text-xs text-prime-muted underline">
                    voltar ao automático
                  </button>
                ) : null}
              </li>
            )
          )}
        </ul>
        {pick.size >= 2 && !locked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const chosen = rows.filter((r) => pick.has(r.id));
              const suggestion = splitBaseRef(chosen[0].ref) ?? chosen[0].ref ?? "Disponível";
              const name = window.prompt("Nome do item na fatura (como o cliente vai ver, ex.: NR264874-B ou Disponível 10h):", suggestion);
              if (name && name.trim()) void merge(chosen.map((r) => r.id), name.trim(), `Pronto: ${chosen.length} serviços saem como um item só (${name.trim()}).`);
            }}
            className="justify-self-start rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-prime-gold disabled:opacity-50"
          >
            Juntar {pick.size} serviços em um item
          </button>
        ) : null}
      </section>
    ) : null}
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">✏️ Corrigir valores desta fatura</h3>
        <span className="text-sm">
          Total: <b className="tabular-nums">{brl(total)}</b>
        </span>
      </div>
      <p className="text-xs text-prime-muted">
        {locked ? "Fatura paga ou cancelada: valores travados." : "Ex.: diária lançada como transfer. Ao salvar, o total da fatura, o “a receber” e o repasse do motorista (se ainda não pago) se ajustam sozinhos."}
      </p>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}
      <ul className="divide-y divide-prime-border rounded-xl border border-prime-border">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-2 px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                <b>{new Date(r.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</b>
                {r.ref ? ` · ${r.ref}` : ""}
                {r.passenger ? ` · ${r.passenger}` : ""}
                <span className="block truncate text-xs text-prime-muted">
                  {short(r.origin)} → {short(r.destination)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-right tabular-nums">
                  <b>{r.client_amount == null ? "sem valor" : brl(r.client_amount)}</b>
                  <span className="block text-[11px] text-prime-muted">motorista {r.driver_amount == null ? "—" : brl(r.driver_amount)}</span>
                </span>
                {!locked && edit !== r.id ? (
                  <button type="button" onClick={() => start(r)} className="rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-prime-border hover:ring-prime-gold">
                    Editar
                  </button>
                ) : null}
              </span>
            </div>
            {edit === r.id ? (
              <div className="grid gap-2 rounded-lg bg-prime-bg p-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                <label className="grid gap-1 text-xs">
                  <span>Valor do cliente (R$)</span>
                  <input autoFocus inputMode="decimal" className="rounded-lg border border-prime-border px-2 py-1.5 text-sm" value={client} onChange={(e) => setClient(e.target.value.replace(/[^0-9.,]/g, ""))} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
                </label>
                <label className="grid gap-1 text-xs">
                  <span>Motorista recebe (R$)</span>
                  <input inputMode="decimal" className="rounded-lg border border-prime-border px-2 py-1.5 text-sm" value={driver} onChange={(e) => setDriver(e.target.value.replace(/[^0-9.,]/g, ""))} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
                </label>
                <button type="button" disabled={busy} onClick={() => void save(r)} className="rounded-lg bg-[#111] px-4 py-2 text-xs font-bold text-prime-gold disabled:opacity-50">
                  {busy ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" onClick={() => setEdit(null)} className="px-2 py-2 text-xs text-prime-muted">
                  Cancelar
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
    </>
  );
}
