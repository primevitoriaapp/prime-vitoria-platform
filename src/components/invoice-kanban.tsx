"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type ClientAcc = {
  client_id: string;
  client_name: string;
  billing: string;
  per_service: boolean;
  invoiced: boolean;
  payment_term_days: number | null;
  approved_from: string | null;
  approved_to: string | null;
  approved_total: number;
  approved_count: number;
  to_approve_total: number;
  to_approve_count: number;
  upcoming_total: number;
  upcoming_count: number;
  trips?: AccTrip[];
};
type AccTrip = { id: string; scheduled_at: string; stage: "aprovada" | "aprovar" | "agendada"; ref: string | null; passenger: string | null; route: string; client_amount: number | null };
type Inv = {
  id: string;
  number: number;
  client_id: string;
  client_name?: string | null;
  client_ref?: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  trip_count: number;
  total_amount: number;
  status: "aberta" | "enviada" | "paga" | "cancelada";
  nf_path?: string | null;
  nf_number?: string | null;
  boleto_path?: string | null;
  boleto_url?: string | null;
  paid_at?: string | null;
  viewed_at?: string | null;
};
type Col = "execucao" | "fechar" | "faturado" | "enviado";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (ymd: string) => ymd.split("-").reverse().join("/");
const todayYmd = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const monthKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

const COLS: { id: Col; title: string; hint: string }[] = [
  { id: "execucao", title: "Em execução", hint: "Corridas agendadas ou aguardando sua aprovação" },
  { id: "fechar", title: "A fechar", hint: "Aprovadas e prontas: arraste para fechar a fatura" },
  { id: "faturado", title: "Faturado", hint: "Fatura fechada: anexe nota e boleto e envie" },
  { id: "enviado", title: "Enviado · a receber", hint: "Aguardando pagamento do cliente" }
];

/** Quadro do faturamento (como no Omie): cada card anda da esquerda para a direita. */
export function InvoiceKanban({ onChanged }: { onChanged?: () => void }) {
  const [accs, setAccs] = useState<ClientAcc[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState<{ col: Col; key: string } | null>(null);
  const [over, setOver] = useState<Col | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const months = [monthKey(prev), monthKey(now)];
    const [a, b, i] = await Promise.all([
      ...months.map((m) => fetchWithSupabaseSession(`/api/client-invoices/open-period?month=${m}`, {}, "admin").then((r) => r.json()).catch(() => null)),
      fetchWithSupabaseSession("/api/client-invoices", {}, "admin").then((r) => r.json()).catch(() => null)
    ]);
    const merged = new Map<string, ClientAcc>();
    for (const j of [a, b]) {
      for (const c of ((j?.data?.clients ?? []) as ClientAcc[])) {
        const m = merged.get(c.client_id);
        if (!m) {
          merged.set(c.client_id, { ...c });
          continue;
        }
        m.approved_total += c.approved_total;
        m.approved_count += c.approved_count;
        m.to_approve_total += c.to_approve_total;
        m.to_approve_count += c.to_approve_count;
        m.upcoming_total += c.upcoming_total;
        m.upcoming_count += c.upcoming_count;
        m.trips = [...(m.trips ?? []), ...(c.trips ?? [])];
        if (c.approved_from && (!m.approved_from || c.approved_from < m.approved_from)) m.approved_from = c.approved_from;
        if (c.approved_to && (!m.approved_to || c.approved_to > m.approved_to)) m.approved_to = c.approved_to;
      }
    }
    setAccs([...merged.values()]);
    if (i?.success) setInvs(i.data as Inv[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener("invoices-changed", on);
    return () => window.removeEventListener("invoices-changed", on);
  }, [load]);

  // Cliente que fecha por serviço: escolhe as corridas aprovadas e fecha uma fatura só com elas.
  const [picking, setPicking] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function startPick(c: ClientAcc) {
    const ok = (c.trips ?? []).filter((t) => t.stage === "aprovada");
    setPicked(new Set(ok.map((t) => t.id)));
    setPicking(c.client_id);
    setMsg(null);
  }

  async function closePicked(c: ClientAcc) {
    const trips = (c.trips ?? []).filter((t) => t.stage === "aprovada" && picked.has(t.id));
    if (!trips.length) return setMsg({ ok: false, text: "Marque pelo menos uma corrida." });
    const days = [...new Set(trips.map((t) => new Date(t.scheduled_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })))];
    const ref = `SERVIÇOS DE ${days.length > 3 ? `${days[0]} A ${days[days.length - 1]}` : days.join(", ")}`;
    const due = new Date(Date.now() + (c.payment_term_days ?? 30) * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    setBusy(c.client_id);
    const r = await fetchWithSupabaseSession(
      "/api/client-invoices/vouchers",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_ids: trips.map((t) => t.id), due_date: due, ref }) },
      "admin"
    ).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: { invoice_id: string }; error?: { message?: string } }) : {};
    setBusy(null);
    if (!r?.ok || !j.success || !j.data) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível fechar." });
    window.location.href = `/finance/faturas/${j.data.invoice_id}?nova=1`;
  }

  const cols = useMemo(() => {
    const execucao = accs.filter((c) => c.upcoming_count + c.to_approve_count > 0);
    const fechar = accs.filter((c) => c.approved_count > 0);
    const faturado = invs.filter((v) => v.status === "aberta");
    const enviado = invs.filter((v) => v.status === "enviada").sort((x, y) => x.due_date.localeCompare(y.due_date));
    return { execucao, fechar, faturado, enviado };
  }, [accs, invs]);

  const totals: Record<Col, number> = {
    execucao: cols.execucao.reduce((s, c) => s + c.upcoming_total + c.to_approve_total, 0),
    fechar: cols.fechar.reduce((s, c) => s + c.approved_total, 0),
    faturado: cols.faturado.reduce((s, v) => s + Number(v.total_amount), 0),
    enviado: cols.enviado.reduce((s, v) => s + Number(v.total_amount), 0)
  };

  async function closeClient(c: ClientAcc) {
    if (c.per_service) {
      startPick(c);
      return;
    }
    if (!c.invoiced) {
      setMsg({ ok: false, text: `${c.client_name} está como “não faturado” (paga antes). Mude no cadastro do cliente se for faturar.` });
      return;
    }
    const start = c.approved_from ?? todayYmd();
    const end = c.approved_to ?? todayYmd();
    const extra = c.upcoming_count + c.to_approve_count;
    if (
      !window.confirm(
        `Fechar a fatura de ${c.client_name}?\n\n${c.approved_count} corrida(s) aprovada(s) de ${br(start)} a ${br(end)}\nTotal: ${brl(c.approved_total)}\nVencimento: ${c.payment_term_days ?? 30} dias${extra ? `\n\nAtenção: ${extra} corrida(s) ainda não aprovada(s) ficam de fora e entram na próxima fatura.` : ""}`
      )
    )
      return;
    setBusy(c.client_id);
    setMsg(null);
    try {
      const r = await fetchWithSupabaseSession(
        "/api/client-invoices/generate",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: c.client_id, period_start: start, period_end: end }) },
        "admin"
      );
      const j = await r.json().catch(() => ({}));
      const res = (j?.data?.results ?? [])[0] as { invoice_id?: string; skipped?: string; total_amount?: number } | undefined;
      if (!r.ok || !j.success) setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível fechar." });
      else if (res?.skipped) setMsg({ ok: false, text: `${c.client_name}: ${res.skipped}` });
      else if (res?.invoice_id) {
        window.location.href = `/finance/faturas/${res.invoice_id}?nova=1`;
        return;
      } else setMsg({ ok: true, text: `Fatura de ${c.client_name} fechada: ${brl(Number(res?.total_amount ?? c.approved_total))}. Ela está na coluna “Faturado”.` });
    } catch {
      setMsg({ ok: false, text: "Sem conexão. Tente de novo." });
    }
    setBusy(null);
    await load();
    onChanged?.();
  }

  async function cancelTrip(t: AccTrip, c: ClientAcc) {
    const when = new Date(t.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    if (!window.confirm(`Cancelar a corrida de ${when}${t.passenger ? ` (${t.passenger})` : ""} de ${c.client_name}?\n\nEla sai do fechamento e não é cobrada.`)) return;
    setBusy(t.id);
    const r = await fetchWithSupabaseSession(
      `/api/trips/${t.id}/status`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_status: "cancelled" }) },
      "admin"
    ).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    setMsg(r?.ok && j?.success ? { ok: true, text: `Corrida de ${when} cancelada.` } : { ok: false, text: j?.error?.message ?? "Não foi possível cancelar." });
    await load();
  }

  async function markPaid(v: Inv) {
    const when = window.prompt(`Marcar a fatura nº ${v.number} (${v.client_name ?? ""}) como PAGA?\n${brl(Number(v.total_amount))}\n\nData do pagamento (dd/mm/aaaa):`, br(todayYmd()));
    if (!when) return;
    const m = when.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) {
      setMsg({ ok: false, text: "Data inválida. Use dd/mm/aaaa." });
      return;
    }
    setBusy(v.id);
    const r = await fetchWithSupabaseSession(
      `/api/client-invoices/${v.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paga", paid_on: `${m[3]}-${m[2]}-${m[1]}` }) },
      "admin"
    ).catch(() => null);
    setBusy(null);
    setMsg(r?.ok ? { ok: true, text: `Fatura nº ${v.number} marcada como paga. Os repasses ligados a ela foram liberados.` } : { ok: false, text: "Não foi possível marcar como paga." });
    await load();
    onChanged?.();
  }

  function openInvoice(v: Inv) {
    window.location.href = `/finance/faturas/${v.id}`;
  }

  function onDrop(to: Col) {
    const d = drag;
    setDrag(null);
    setOver(null);
    if (!d || d.col === to) return;
    if (d.col === "fechar" && to === "faturado") {
      const c = cols.fechar.find((x) => x.client_id === d.key);
      if (c) void closeClient(c);
      return;
    }
    if (d.col === "faturado" && to === "enviado") {
      const v = cols.faturado.find((x) => x.id === d.key);
      if (v && window.confirm(`Abrir a fatura nº ${v.number} para conferir os anexos e enviar ao cliente?`)) openInvoice(v);
      return;
    }
    if (d.col === "execucao" && to === "fechar") {
      setMsg({ ok: false, text: "Para ir para “A fechar”, as corridas precisam ser aprovadas primeiro (Aprovar corridas)." });
      return;
    }
    setMsg({ ok: false, text: "Os cards andam um passo por vez, da esquerda para a direita." });
  }

  const card = "rounded-xl border border-prime-border bg-white p-3 shadow-sm";
  const dueTone = (ymd: string) => (ymd < todayYmd() ? "text-red-700" : ymd <= new Date(Date.now() + 3 * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) ? "text-amber-700" : "text-prime-muted");

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-prime-gold-ink">Quadro do faturamento</p>
          <p className="text-sm text-prime-muted">Arraste o card para a próxima coluna (ou use o botão do card). Mês atual e anterior.</p>
        </div>
        <button type="button" onClick={() => void load()} className="text-xs font-semibold text-prime-gold-ink">
          ↻ Atualizar
        </button>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 xl:grid xl:grid-cols-4 xl:overflow-visible">
        {COLS.map((col) => {
          const n = cols[col.id].length;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={() => onDrop(col.id)}
              className={`flex w-[82vw] max-w-[340px] shrink-0 snap-start flex-col gap-2 rounded-2xl p-2 transition xl:w-auto xl:max-w-none ${over === col.id ? "bg-prime-gold/20 ring-2 ring-prime-gold" : "bg-prime-bg"}`}
            >
              <div className="px-1 pt-1">
                <p className="flex items-center justify-between text-sm font-semibold">
                  {col.title} <span className="rounded-full bg-white px-2 text-xs">{n}</span>
                </p>
                <p className="text-base font-bold tabular-nums">{brl(totals[col.id])}</p>
                <p className="text-[11px] leading-tight text-prime-muted">{col.hint}</p>
              </div>
              {loading ? <p className="px-1 text-xs text-prime-muted">Carregando…</p> : null}
              {!loading && n === 0 ? <p className="px-1 py-4 text-center text-xs text-prime-muted">Nada aqui</p> : null}

              {col.id === "execucao"
                ? cols.execucao.map((c) => (
                    <div key={c.client_id} className={card}>
                      <p className="font-semibold">{c.client_name}</p>
                      <p className="text-[11px] text-prime-muted">{c.billing}</p>
                      {c.to_approve_count ? (
                        <a href="/conferencia" className="mt-1 block text-xs font-semibold text-amber-700">
                          {c.to_approve_count} a aprovar · {brl(c.to_approve_total)} →
                        </a>
                      ) : null}
                      {c.upcoming_count ? <p className="text-xs text-prime-muted">{c.upcoming_count} agendada(s) · {brl(c.upcoming_total)}</p> : null}
                      {(c.trips ?? [])
                        .filter((t) => t.stage === "agendada" && new Date(t.scheduled_at).getTime() < Date.now() - 3 * 3600000)
                        .map((t) => (
                          <div key={t.id} className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs">
                            <p>
                              ⚠ <b>{new Date(t.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</b>
                              {t.passenger ? ` · ${t.passenger}` : ""} — já passou e não foi concluída
                            </p>
                            <div className="mt-1 flex gap-2">
                              <a href={`/agenda?trip=${t.id}`} className="rounded-md bg-white px-2 py-1 font-semibold ring-1 ring-prime-border">
                                Abrir
                              </a>
                              <button type="button" disabled={busy === t.id} onClick={() => void cancelTrip(t, c)} className="rounded-md bg-white px-2 py-1 font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-50">
                                {busy === t.id ? "Cancelando…" : "Foi cancelada"}
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))
                : null}

              {col.id === "fechar"
                ? cols.fechar.map((c) => (
                    <div
                      key={c.client_id}
                      draggable
                      onDragStart={() => setDrag({ col: "fechar", key: c.client_id })}
                      className={`${card} cursor-grab active:cursor-grabbing`}
                    >
                      <p className="font-semibold">{c.client_name}</p>
                      <p className="text-lg font-bold tabular-nums">{brl(c.approved_total)}</p>
                      <p className="text-xs text-prime-muted">
                        {c.approved_count} corrida(s){c.approved_from ? ` · ${br(c.approved_from).slice(0, 5)} a ${br(c.approved_to ?? c.approved_from).slice(0, 5)}` : ""}
                      </p>
                      <p className="text-[11px] text-prime-muted">{c.per_service ? "fecha por serviço (voucher)" : c.invoiced ? `paga em ${c.payment_term_days ?? 30} dias` : "não faturado (pagou antes)"}</p>
                      {picking === c.client_id ? (
                        <div className="mt-2 grid gap-1.5">
                          <p className="text-xs font-semibold">Marque o que entra nesta fatura:</p>
                          {(c.trips ?? [])
                            .filter((t) => t.stage === "aprovada")
                            .map((t) => (
                              <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-prime-bg px-2 py-1.5 text-xs">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={picked.has(t.id)}
                                  onChange={(e) =>
                                    setPicked((p) => {
                                      const n = new Set(p);
                                      if (e.target.checked) n.add(t.id);
                                      else n.delete(t.id);
                                      return n;
                                    })
                                  }
                                />
                                <span className="min-w-0 flex-1">
                                  <b>{new Date(t.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</b>
                                  {t.passenger ? ` · ${t.passenger}` : ""}
                                  <span className="block truncate text-prime-muted">{t.route}</span>
                                </span>
                                <span className="font-semibold tabular-nums">{brl(Number(t.client_amount ?? 0))}</span>
                              </label>
                            ))}
                          <button
                            type="button"
                            disabled={busy === c.client_id || !picked.size}
                            onClick={() => void closePicked(c)}
                            className="mt-1 w-full rounded-lg bg-[#111] py-2 text-xs font-bold text-prime-gold disabled:opacity-50"
                          >
                            {busy === c.client_id
                              ? "Fechando…"
                              : `Fechar fatura · ${brl((c.trips ?? []).filter((t) => picked.has(t.id)).reduce((s, t) => s + Number(t.client_amount ?? 0), 0))} →`}
                          </button>
                          <button type="button" onClick={() => setPicking(null)} className="text-xs text-prime-muted">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button type="button" disabled={busy === c.client_id} onClick={() => void closeClient(c)} className="mt-2 w-full rounded-lg bg-[#111] py-2 text-xs font-bold text-prime-gold disabled:opacity-50">
                          {busy === c.client_id ? "Fechando…" : c.per_service ? "Escolher corridas e fechar →" : "Fechar fatura →"}
                        </button>
                      )}
                    </div>
                  ))
                : null}

              {col.id === "faturado"
                ? cols.faturado.map((v) => {
                    const nf = Boolean(v.nf_path || v.nf_number);
                    const boleto = Boolean(v.boleto_path || v.boleto_url);
                    return (
                      <div key={v.id} draggable onDragStart={() => setDrag({ col: "faturado", key: v.id })} className={`${card} cursor-grab active:cursor-grabbing`}>
                        <p className="flex justify-between gap-2 font-semibold">
                          <span className="truncate">{v.client_name ?? "Cliente"}</span>
                          <span className="text-xs text-prime-muted">nº {v.number}</span>
                        </p>
                        <p className="text-lg font-bold tabular-nums">{brl(Number(v.total_amount))}</p>
                        <p className="text-xs text-prime-muted">{v.trip_count} corrida(s){v.client_ref ? ` · ${v.client_ref}` : ""}</p>
                        <p className="mt-1 flex gap-3 text-xs">
                          <span className={nf ? "text-emerald-700" : "text-amber-700"}>{nf ? "✓" : "○"} Nota</span>
                          <span className={boleto ? "text-emerald-700" : "text-amber-700"}>{boleto ? "✓" : "○"} Boleto</span>
                        </p>
                        <button type="button" onClick={() => openInvoice(v)} className="mt-2 w-full rounded-lg bg-[#111] py-2 text-xs font-bold text-prime-gold">
                          {nf && boleto ? "Enviar ao cliente →" : "Anexar e enviar →"}
                        </button>
                      </div>
                    );
                  })
                : null}

              {col.id === "enviado"
                ? cols.enviado.map((v) => (
                    <div key={v.id} className={card}>
                      <p className="flex justify-between gap-2 font-semibold">
                        <span className="truncate">{v.client_name ?? "Cliente"}</span>
                        <span className="text-xs text-prime-muted">nº {v.number}</span>
                      </p>
                      <p className="text-lg font-bold tabular-nums">{brl(Number(v.total_amount))}</p>
                      <p className={`text-xs font-semibold ${dueTone(v.due_date)}`}>
                        {v.due_date < todayYmd() ? "VENCIDA em " : "Vence "}
                        {br(v.due_date)}
                      </p>
                      <p className="text-[11px] text-prime-muted">{v.viewed_at ? "✓ cliente abriu a fatura" : "cliente ainda não abriu"}</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={busy === v.id} onClick={() => void markPaid(v)} className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-[#fff] disabled:opacity-50">
                          Recebi ✓
                        </button>
                        <button type="button" onClick={() => openInvoice(v)} className="rounded-lg border border-prime-border px-3 py-2 text-xs">
                          Abrir
                        </button>
                      </div>
                    </div>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
