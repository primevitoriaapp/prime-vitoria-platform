"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { BodyPortal } from "@/components/ui/body-portal";

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
type AccTrip = { id: string; scheduled_at: string; stage: "aprovada" | "aprovar" | "agendada"; ref: string | null; ref_guess?: string | null; has_voucher?: boolean; passenger: string | null; route: string; client_amount: number | null };
type VCard = { key: string; client: ClientAcc; nr: string; isNr: boolean; trips: AccTrip[]; missing: AccTrip[]; total: number; billed: Inv[] };
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
  const [q, setQ] = useState("");
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

  /** Clientes que fecham por serviço (ex.: CEP): um card por voucher (NR) + um card "sem voucher". */
  const vouchers = useMemo(() => {
    const out: VCard[] = [];
    for (const c of accs.filter((x) => x.per_service && x.approved_count > 0)) {
      const all = c.trips ?? [];
      const ok = all.filter((t) => t.stage === "aprovada");
      // Cliente que trabalha com NR (ex.: CEP): um card por NR. Cliente sem NR (ex.: Seg Pro): um card por dia.
      const usesNr = all.some((t) => t.ref);
      const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
      const by = new Map<string, AccTrip[]>();
      for (const t of ok) {
        const k = t.ref ? t.ref.replace(/-.*$/, "") : usesNr ? "" : `SERVIÇOS DE ${day(t.scheduled_at)}`;
        by.set(k, [...(by.get(k) ?? []), t]);
      }
      for (const [nr, trips] of by) {
        trips.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
        const isNr = /^NR/i.test(nr) || (usesNr && nr !== "" && !nr.startsWith("SERVIÇOS"));
        const missing = isNr ? all.filter((t) => t.stage !== "aprovada" && t.ref?.replace(/-.*$/, "") === nr) : [];
        const billed = isNr ? invs.filter((i) => i.client_id === c.client_id && (i.client_ref ?? "").toUpperCase() === nr.toUpperCase()) : [];
        out.push({ key: `${c.client_id}|${nr || "-"}`, client: c, nr, isNr, trips, missing, billed, total: trips.reduce((x, t) => x + Number(t.client_amount ?? 0), 0) });
      }
    }
    // Sem voucher primeiro (precisa de atenção), depois por data do primeiro serviço.
    return out.sort((a, b) => (a.nr === "" ? -1 : b.nr === "" ? 1 : a.trips[0].scheduled_at.localeCompare(b.trips[0].scheduled_at)));
  }, [accs, invs]);

  async function closeVoucher(v: VCard) {
    const pax = [...new Set(v.trips.flatMap((t) => String(t.passenger ?? "").split(",").map((x) => x.trim()).filter(Boolean)))];
    const already = v.billed.length ? `\n\n⚠ Este voucher JÁ TEM fatura (${v.billed.map((b) => `nº ${b.number} de ${brl(Number(b.total_amount))}`).join(", ")}). Esta será uma fatura complementar. Confira se a corrida não foi cobrada.` : "";
    const warn = (v.missing.length ? `\n\nAtenção: ${v.missing.length} corrida(s) deste voucher ainda não estão aprovadas e ficam de fora.` : "") + already;
    if (!window.confirm(`Fechar a fatura ${v.isNr ? `do voucher ${v.nr}` : `de ${v.nr.toLowerCase()}`} (${v.client.client_name})?\n\n${pax.join(", ")}\n${v.trips.length} corrida(s) · ${brl(v.total)}${warn}`)) return;
    const due = new Date(Date.now() + (v.client.payment_term_days ?? 30) * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    setBusy(v.key);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      "/api/client-invoices/vouchers",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_ids: v.trips.map((t) => t.id), due_date: due, ref: v.nr }) },
      "admin"
    ).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: { invoice_id: string }; error?: { message?: string } }) : {};
    setBusy(null);
    if (!r?.ok || !j.success || !j.data) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível fechar." });
    window.location.href = `/finance/faturas/${j.data.invoice_id}?nova=1`;
  }

  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^nr\s*/, "");
  const hit = (...parts: (string | number | null | undefined)[]) => !q.trim() || parts.some((p) => p != null && norm(String(p)).includes(norm(q.trim())));
  const shownVouchers = vouchers.filter((v) => hit(v.nr, v.client.client_name, ...v.trips.map((t) => t.passenger), ...v.trips.map((t) => t.ref)));

  const cols = useMemo(() => {
    const execucao = accs.filter((c) => c.upcoming_count + c.to_approve_count > 0);
    const fechar = accs.filter((c) => c.approved_count > 0 && !c.per_service);
    const faturado = invs.filter((v) => v.status === "aberta");
    const enviado = invs.filter((v) => v.status === "enviada").sort((x, y) => x.due_date.localeCompare(y.due_date));
    return { execucao, fechar, faturado, enviado };
  }, [accs, invs]);

  const totals: Record<Col, number> = {
    execucao: cols.execucao.reduce((s, c) => s + c.upcoming_total + c.to_approve_total, 0),
    fechar: cols.fechar.reduce((s, c) => s + c.approved_total, 0) + vouchers.reduce((s, v) => s + v.total, 0),
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

  // "Cliente já pagou": fecha a fatura com as corridas aprovadas e já marca como paga (PIX na hora, pessoa física…).
  const [paying, setPaying] = useState<string | null>(null);
  const [payOn, setPayOn] = useState(todayYmd());
  const [payHow, setPayHow] = useState<"pix" | "transferencia" | "dinheiro" | "boleto" | "outro">("pix");

  async function closePaid(c: ClientAcc) {
    const trips = (c.trips ?? []).filter((t) => t.stage === "aprovada");
    if (!trips.length) return setMsg({ ok: false, text: "Nenhuma corrida aprovada para fechar." });
    const days = [...new Set(trips.map((t) => new Date(t.scheduled_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })))];
    setBusy(c.client_id);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      "/api/client-invoices/vouchers",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_ids: trips.map((t) => t.id), due_date: payOn, ref: `SERVIÇOS DE ${days.join(", ")}` }) },
      "admin"
    ).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: { invoice_id: string }; error?: { message?: string } }) : {};
    if (!r?.ok || !j.success || !j.data) {
      setBusy(null);
      return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível fechar." });
    }
    const p = await fetchWithSupabaseSession(
      `/api/client-invoices/${j.data.invoice_id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paga", paid_on: payOn, payment_method: payHow }) },
      "admin"
    ).catch(() => null);
    setBusy(null);
    setPaying(null);
    setMsg(
      p?.ok
        ? { ok: true, text: `${c.client_name}: ${brl(trips.reduce((s2, t) => s2 + Number(t.client_amount ?? 0), 0))} recebido e fechado ✓. Está em “Pagas”.` }
        : { ok: false, text: "A fatura foi criada, mas não consegui marcar como paga: abra em “Faturado” e clique em “Marcar como paga”." }
    );
    await load();
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
      const v = vouchers.find((x) => x.key === d.key);
      if (v) {
        if (v.nr) void closeVoucher(v);
        else setMsg({ ok: false, text: "Informe o NR dessas corridas antes de fechar." });
        return;
      }
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

  const card = "min-w-0 overflow-hidden rounded-xl border border-prime-border bg-white p-3 shadow-sm";
  const dueTone = (ymd: string) => (ymd < todayYmd() ? "text-red-700" : ymd <= new Date(Date.now() + 3 * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) ? "text-amber-700" : "text-prime-muted");

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-prime-gold-ink">Quadro do faturamento</p>
          <p className="text-sm text-prime-muted">Arraste o card para a próxima coluna (ou use o botão do card). Mês atual e anterior.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar NR, cliente ou passageiro" className="min-w-0 flex-1 rounded-lg border border-prime-border bg-white px-3 py-2 text-base sm:w-72 sm:flex-none sm:text-sm" />
          <button type="button" onClick={() => void load()} className="shrink-0 text-xs font-semibold text-prime-gold-ink">
            ↻ Atualizar
          </button>
        </div>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 xl:grid xl:grid-cols-4 xl:overflow-visible">
        {COLS.map((col) => {
          const list = col.id === "execucao" ? cols.execucao.filter((c) => hit(c.client_name)) : col.id === "fechar" ? cols.fechar.filter((c) => hit(c.client_name)) : col.id === "faturado" ? cols.faturado.filter((v) => hit(v.client_name, v.client_ref, v.number)) : cols.enviado.filter((v) => hit(v.client_name, v.client_ref, v.number));
          const n = list.length + (col.id === "fechar" ? shownVouchers.length : 0);
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={() => onDrop(col.id)}
              className={`flex min-w-0 w-[82vw] max-w-[340px] shrink-0 snap-start flex-col gap-2 rounded-2xl p-2 transition xl:w-auto xl:max-w-none ${over === col.id ? "bg-prime-gold/20 ring-2 ring-prime-gold" : "bg-prime-bg"}`}
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
                ? cols.execucao.filter((c) => hit(c.client_name)).map((c) => (
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
                ? shownVouchers.map((v) =>
                    v.nr ? (
                      <VoucherCard key={v.key} v={v} card={card} busy={busy === v.key} onClose={() => void closeVoucher(v)} onDrag={() => setDrag({ col: "fechar", key: v.key })} onSaved={() => void load()} />
                    ) : (
                      <NoRefCard key={v.key} v={v} onSaved={() => void load()} />
                    )
                  )
                : null}

              {col.id === "fechar"
                ? cols.fechar.filter((c) => hit(c.client_name)).map((c) => (
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
                        <div className="mt-2 grid min-w-0 grid-cols-1 gap-1.5">
                          <p className="text-xs font-semibold">Marque o que entra nesta fatura:</p>
                          {(c.trips ?? [])
                            .filter((t) => t.stage === "aprovada")
                            .map((t) => (
                              <label key={t.id} className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg bg-prime-bg px-2 py-1.5 text-xs">
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
                                  <b>{whenBR(t.scheduled_at)}</b>
                                  {t.ref ? ` · ${t.ref}` : t.passenger ? ` · ${t.passenger}` : ""}
                                  <span className="block truncate text-prime-muted">{t.route}</span>
                                </span>
                                <span className="shrink-0 font-semibold tabular-nums">{brl(Number(t.client_amount ?? 0))}</span>
                              </label>
                            ))}
                          <button
                            type="button"
                            disabled={busy === c.client_id || !picked.size}
                            onClick={() => void closePicked(c)}
                            className="mt-1 w-full min-w-0 rounded-lg bg-[#111] px-2 py-2.5 text-xs font-bold text-prime-gold disabled:opacity-50"
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
                        <>
                          {c.invoiced ? (
                            <button type="button" disabled={busy === c.client_id} onClick={() => void closeClient(c)} className="mt-2 w-full rounded-lg bg-[#111] py-2 text-xs font-bold text-prime-gold disabled:opacity-50">
                              {busy === c.client_id ? "Fechando…" : c.per_service ? "Escolher corridas e fechar →" : "Fechar fatura →"}
                            </button>
                          ) : null}
                          {paying === c.client_id ? (
                            <div className="mt-2 grid gap-1.5 rounded-lg bg-emerald-50 p-2 text-xs">
                              <p className="font-semibold">Cliente já pagou {brl(c.approved_total)}</p>
                              <label className="grid gap-0.5">
                                <span>Pago em</span>
                                <input type="date" value={payOn} onChange={(e) => setPayOn(e.target.value)} className="rounded-md border border-prime-border bg-white px-2 py-1" />
                              </label>
                              <label className="grid gap-0.5">
                                <span>Forma</span>
                                <select value={payHow} onChange={(e) => setPayHow(e.target.value as typeof payHow)} className="rounded-md border border-prime-border bg-white px-2 py-1">
                                  <option value="pix">PIX / link de pagamento</option>
                                  <option value="transferencia">Transferência</option>
                                  <option value="dinheiro">Dinheiro</option>
                                  <option value="boleto">Boleto</option>
                                  <option value="outro">Outro</option>
                                </select>
                              </label>
                              <button type="button" disabled={busy === c.client_id} onClick={() => void closePaid(c)} className="rounded-md bg-emerald-700 py-1.5 font-bold text-[#fff] disabled:opacity-50">
                                {busy === c.client_id ? "Salvando…" : "Confirmar recebido ✓"}
                              </button>
                              <button type="button" onClick={() => setPaying(null)} className="text-prime-muted">
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPaying(c.client_id);
                                setPayOn(todayYmd());
                              }}
                              className={`mt-1.5 w-full rounded-lg py-2 text-xs font-bold ring-1 ${c.invoiced ? "text-emerald-800 ring-emerald-200" : "bg-emerald-700 text-[#fff] ring-emerald-700"}`}
                            >
                              ✓ Cliente já pagou
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))
                : null}

              {col.id === "faturado"
                ? cols.faturado.filter((v) => hit(v.client_name, v.client_ref, v.number)).map((v) => {
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
                ? cols.enviado.filter((v) => hit(v.client_name, v.client_ref, v.number)).map((v) => (
                    <div key={v.id} className={card}>
                      <p className="flex justify-between gap-2 font-semibold">
                        <span className="truncate">{v.client_name ?? "Cliente"}</span>
                        <span className="text-xs text-prime-muted">nº {v.number}</span>
                      </p>
                      <p className="text-lg font-bold tabular-nums">{brl(Number(v.total_amount))}</p>
                      {v.client_ref ? <p className="text-xs font-semibold">{/^NR/i.test(v.client_ref) ? `Voucher ${v.client_ref}` : v.client_ref}</p> : null}
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

const moneyBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const whenBR = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const paxOf = (list: AccTrip[]) => [...new Set(list.flatMap((t) => String(t.passenger ?? "").split(",").map((x) => x.trim()).filter(Boolean)))];
const shortName = (n: string) => {
  const w = n.split(/\s+/).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase());
  return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : (w[0] ?? "");
};

/** Um voucher (NR) pronto para virar fatura. */
function VoucherCard({ v, card, busy, onClose, onDrag, onSaved }: { v: VCard; card: string; busy: boolean; onClose: () => void; onDrag: () => void; onSaved: () => void }) {
  const [open, setOpen] = useState(v.trips.length <= 4);
  const [peek, setPeek] = useState<AccTrip | null>(null);
  const withFile = v.trips.find((t) => t.has_voucher);
  const pax = paxOf(v.trips);
  // Mesmo item do voucher em duas corridas: provável erro de digitação.
  const items = v.trips.map((t) => (t.ref?.includes("-") ? t.ref.slice(t.ref.indexOf("-") + 1) : null));
  const dup = items.filter((x, i) => x && items.indexOf(x) !== i);
  return (
    <div draggable onDragStart={onDrag} className={`${card} cursor-grab active:cursor-grabbing`}>
      <button type="button" onClick={() => (v.trips.length === 1 ? setPeek(v.trips[0]) : setOpen((o) => !o))} className="block w-full min-w-0 text-left">
        <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-prime-muted">{v.client.client_name}</span>
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-bold">{v.isNr ? `Voucher ${v.nr}` : v.nr.charAt(0) + v.nr.slice(1).toLowerCase()}</span>
          <span className="shrink-0 text-base font-bold tabular-nums">{moneyBR(v.total)}</span>
        </span>
        <span className="block truncate text-xs">{pax.length ? pax.map(shortName).join(", ") : "Sem passageiro"}</span>
        <span className="block text-[11px] text-prime-muted">
          {v.trips.length} corrida(s) · {whenBR(v.trips[0].scheduled_at).slice(0, 5)}
          {v.trips.length > 1 ? ` a ${whenBR(v.trips[v.trips.length - 1].scheduled_at).slice(0, 5)}` : ""}
        </span>
      </button>
      {v.billed.length ? (
        <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          Este voucher já tem fatura: {v.billed.map((b) => `nº ${b.number} (${moneyBR(Number(b.total_amount))})`).join(", ")}. Confira se esta corrida não está incluída nela antes de cobrar de novo.
        </p>
      ) : null}
      {v.missing.length ? <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">Falta(m) {v.missing.length} corrida(s) deste voucher (ainda não aprovada). Se fechar agora, ficam de fora.</p> : null}
      {dup.length ? <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-800">Item {[...new Set(dup)].join(", ")} aparece em mais de uma corrida. Confira antes de fechar.</p> : null}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-prime-gold-ink">
          {open ? "Esconder corridas ▴" : `Ver as ${v.trips.length} corridas ▾`}
        </button>
        {withFile ? (
          <a href={`/api/trips/${withFile.id}/client-voucher`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-prime-gold-ink">
            📎 Voucher da CEP
          </a>
        ) : null}
      </div>
      {open ? (
        <ul className="mt-1 grid gap-1">
          {v.trips.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setPeek(t)} className="flex w-full min-w-0 items-start justify-between gap-2 rounded-md bg-prime-bg px-2 py-1.5 text-left text-xs hover:ring-1 hover:ring-prime-gold">
                <span className="min-w-0">
                  {t.ref?.includes("-") ? <b className="mr-1 text-[#7A5C16]">{t.ref.slice(t.ref.indexOf("-") + 1)}</b> : null}
                  {whenBR(t.scheduled_at)}
                  <span className="block truncate text-prime-muted">{t.route}</span>
                </span>
                <span className="shrink-0 tabular-nums">{moneyBR(Number(t.client_amount ?? 0))} ›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" disabled={busy} onClick={onClose} className="mt-2 w-full rounded-lg bg-[#111] py-2 text-xs font-bold text-prime-gold disabled:opacity-50">
        {busy ? "Fechando…" : v.isNr ? "Fechar fatura deste voucher →" : "Fechar fatura deste dia →"}
      </button>
      {peek ? <TripPeek trip={peek} siblings={v.trips} onClose={() => setPeek(null)} onSaved={onSaved} /> : null}
    </div>
  );
}

/** Corridas aprovadas sem NR: a central informa o NR e a corrida vai para o card do voucher. */
function NoRefCard({ v, onSaved }: { v: VCard; onSaved: () => void }) {
  const [peek, setPeek] = useState<AccTrip | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save(tripId: string, ref: string) {
    setErr(null);
    const r = await fetchWithSupabaseSession("/api/client-invoices/set-ref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_id: tripId, ref }) }, "admin").catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }) : {};
    if (!j.success) return setErr(j.error?.message ?? "Não foi possível salvar o NR.");
    setEditing(null);
    setVal("");
    onSaved();
  }
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-amber-900/80">{v.client.client_name}</p>
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-bold text-amber-900">Sem voucher ({v.trips.length})</span>
        <span className="shrink-0 font-bold tabular-nums">{moneyBR(v.total)}</span>
      </p>
      <p className="text-[11px] text-amber-900/80">Diga de qual voucher (NR) é cada corrida. Ela passa para o card do voucher.</p>
      <ul className="mt-2 grid gap-1.5">
        {v.trips.map((t) => (
          <li key={t.id} className="min-w-0 rounded-lg bg-white px-2 py-1.5 text-xs">
            <button type="button" onClick={() => setPeek(t)} className="flex w-full min-w-0 items-start justify-between gap-2 text-left">
              <span className="min-w-0">
                <b>{whenBR(t.scheduled_at)}</b> · {paxOf([t]).map(shortName).join(", ") || "Sem passageiro"}
                <span className="block truncate text-prime-muted">{t.route}</span>
                <span className="text-[11px] font-semibold text-prime-gold-ink">Ver detalhes do serviço ›</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{moneyBR(Number(t.client_amount ?? 0))}</span>
            </button>
            {editing === t.id ? (
              <div className="mt-1 flex min-w-0 gap-1">
                <input
                  autoFocus
                  value={val}
                  onChange={(e) => setVal(e.target.value.toUpperCase())}
                  placeholder="NR263691-B2"
                  className="min-w-0 flex-1 rounded-md border border-prime-border bg-white px-2 py-1.5 text-base sm:text-xs"
                />
                <button type="button" onClick={() => void save(t.id, val)} disabled={val.trim().length < 3} className="rounded-md bg-[#111] px-2 text-xs font-bold text-prime-gold disabled:opacity-50">
                  Salvar
                </button>
                <button type="button" onClick={() => setEditing(null)} className="px-1 text-xs text-prime-muted">
                  ✕
                </button>
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {t.ref_guess ? (
                  <button type="button" onClick={() => void save(t.id, t.ref_guess as string)} className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                    É do {t.ref_guess}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setEditing(t.id);
                    setVal(t.ref_guess ? `${t.ref_guess}-` : "NR");
                  }}
                  className="rounded-md px-2 py-1 text-[11px] ring-1 ring-prime-border"
                >
                  {t.ref_guess ? "Outro voucher" : "Informar NR"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {err ? <p className="mt-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">{err}</p> : null}
      {peek ? <TripPeek trip={peek} siblings={v.trips} onClose={() => setPeek(null)} onSaved={onSaved} /> : null}
    </div>
  );
}

type TripFull = {
  id: string;
  scheduled_at: string;
  operational_status: string;
  passenger_name: string | null;
  passenger_phone: string | null;
  passenger_count: number | null;
  origin_text: string | null;
  destination_text: string | null;
  flight_number: string | null;
  notes: string | null;
  client_amount: number | null;
  km_billable: number | null;
  actual_km: number | null;
  driver_name?: string | null;
  client_voucher_path: string | null;
  trip_dropoff_stops: { address_text: string; passenger_name?: string }[] | null;
  started_at?: string | null;
  completed_at?: string | null;
};

/** Detalhe completo do serviço para conferir com o e-mail/voucher do cliente antes de fechar. */
function TripPeek({ trip, siblings, onClose, onSaved }: { trip: AccTrip; siblings: AccTrip[]; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState<TripFull | null>(null);
  const [nr, setNr] = useState(trip.ref ?? (trip.ref_guess ? `${trip.ref_guess}-` : ""));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasFile, setHasFile] = useState(Boolean(trip.has_voucher));
  useEffect(() => {
    void fetchWithSupabaseSession(`/api/trips/${trip.id}`, {}, "admin")
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: TripFull }) => {
        if (j.success && j.data) {
          setT(j.data);
          setHasFile(Boolean(j.data.client_voucher_path));
        }
      })
      .catch(() => undefined);
  }, [trip.id]);
  async function saveNr() {
    if (nr.trim().length < 3) return setMsg({ ok: false, t: "Digite o NR (ex.: NR263691-B2)." });
    setBusy(true);
    const r = await fetchWithSupabaseSession("/api/client-invoices/set-ref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_id: trip.id, ref: nr.trim() }) }, "admin").catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }) : {};
    setBusy(false);
    if (!j.success) return setMsg({ ok: false, t: j.error?.message ?? "Não foi possível salvar." });
    setMsg({ ok: true, t: "NR salvo. A corrida foi para o card do voucher." });
    onSaved();
  }
  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetchWithSupabaseSession(`/api/trips/${trip.id}/client-voucher`, { method: "POST", body: fd }, "admin").catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setHasFile(true);
      setMsg({ ok: true, t: "Voucher anexado." });
      onSaved();
    } else setMsg({ ok: false, t: "Não foi possível anexar (PDF ou imagem até 10 MB)." });
  }
  const others = siblings.filter((x) => x.id !== trip.id);
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) =>
    v ? (
      <div className="grid grid-cols-[110px_1fr] gap-2 border-b border-prime-border/60 py-2 text-sm last:border-0">
        <span className="text-prime-muted">{k}</span>
        <span className="min-w-0 break-words">{v}</span>
      </div>
    ) : null;
  const STATUS: Record<string, string> = { completed: "Concluída", cancelled: "Cancelada", no_show: "Não compareceu", in_progress: "Em andamento" };
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[120] flex justify-end bg-black/40" onClick={onClose}>
        <div className="flex h-dvh w-full max-w-lg flex-col bg-prime-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b border-prime-border bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-prime-muted">Conferir serviço</p>
              <p className="truncate font-semibold">
                {whenBR(trip.scheduled_at)} · {moneyBR(Number(trip.client_amount ?? 0))}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-sm ring-1 ring-prime-border">
              Fechar
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
            {!t ? <div className="h-40 animate-pulse rounded-xl bg-white" /> : null}
            {t ? (
              <section className="rounded-xl bg-white px-3 py-1">
                <Row k="NR / item" v={trip.ref ?? <span className="font-semibold text-amber-700">sem NR</span>} />
                <Row k="Data e hora" v={new Date(t.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
                <Row k="Passageiro(s)" v={`${t.passenger_name ?? "—"}${t.passenger_count && t.passenger_count > 1 ? ` (${t.passenger_count} pessoas)` : ""}`} />
                <Row k="Telefone" v={t.passenger_phone} />
                <Row k="Voo" v={t.flight_number} />
                <Row k="Saída" v={t.origin_text} />
                <Row k="Paradas" v={t.trip_dropoff_stops?.length ? t.trip_dropoff_stops.map((s) => `${s.passenger_name ? `${s.passenger_name}: ` : ""}${s.address_text}`).join(" → ") : null} />
                <Row k="Destino" v={t.destination_text} />
                <Row k="Motorista" v={t.driver_name} />
                <Row k="KM" v={t.km_billable ?? t.actual_km ? `${t.km_billable ?? t.actual_km} km` : null} />
                <Row k="Situação" v={STATUS[t.operational_status] ?? t.operational_status} />
                <Row k="Valor ao cliente" v={moneyBR(Number(t.client_amount ?? 0))} />
                <Row k="Observações" v={t.notes ? <span className="whitespace-pre-line text-xs">{t.notes}</span> : null} />
              </section>
            ) : null}

            <section className="space-y-2 rounded-xl bg-white p-3">
              <p className="text-sm font-semibold">Voucher do cliente</p>
              {hasFile ? (
                <a href={`/api/trips/${trip.id}/client-voucher`} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-[#111] px-3 py-2.5 text-center text-sm font-semibold text-prime-gold">
                  📎 Abrir voucher anexado
                </a>
              ) : (
                <p className="text-xs text-prime-muted">Nenhum voucher anexado nesta corrida. Anexe o PDF do e-mail da CEP para conferir e guardar junto.</p>
              )}
              <label className="block text-xs text-prime-muted">
                {hasFile ? "Trocar arquivo" : "Anexar voucher (PDF ou foto)"}
                <input type="file" accept="application/pdf,image/*" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} className="mt-1 block w-full text-xs" />
              </label>
            </section>

            <section className="space-y-2 rounded-xl bg-white p-3">
              <p className="text-sm font-semibold">{trip.ref ? "Corrigir NR" : "De qual voucher é este serviço?"}</p>
              <div className="flex gap-2">
                <input value={nr} onChange={(e) => setNr(e.target.value.toUpperCase())} placeholder="NR263691-B2" className="min-w-0 flex-1 rounded-lg border border-prime-border px-3 py-2 text-base sm:text-sm" />
                <button type="button" disabled={busy} onClick={() => void saveNr()} className="rounded-lg bg-[#111] px-4 text-sm font-semibold text-prime-gold disabled:opacity-50">
                  Salvar
                </button>
              </div>
              {trip.ref_guess && !trip.ref ? <p className="text-xs text-prime-muted">Sugestão pelo passageiro: {trip.ref_guess}. Confirme no e-mail antes de salvar.</p> : null}
            </section>

            {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.t}</p> : null}

            {others.length ? (
              <section className="rounded-xl bg-white p-3">
                <p className="mb-1 text-sm font-semibold">Outras corridas neste card</p>
                <ul className="grid gap-1 text-xs">
                  {others.map((o) => (
                    <li key={o.id} className="flex justify-between gap-2 rounded-md bg-prime-bg px-2 py-1.5">
                      <span className="min-w-0">
                        <b>{whenBR(o.scheduled_at)}</b> {o.ref ? `· ${o.ref}` : ""}
                        <span className="block truncate text-prime-muted">{o.route}</span>
                      </span>
                      <span className="shrink-0">{moneyBR(Number(o.client_amount ?? 0))}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <a href={`/agenda?trip=${trip.id}`} className="block rounded-lg px-3 py-2.5 text-center text-sm font-semibold ring-1 ring-prime-border">
              Abrir a corrida completa na agenda (editar, cancelar)
            </a>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
