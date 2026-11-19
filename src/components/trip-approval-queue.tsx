"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Item = {
  id: string;
  scheduled_at: string;
  client: string;
  driver: string | null;
  ref: string | null;
  passenger: string | null;
  origin: string | null;
  destination: string | null;
  by_km: boolean;
  odometer_start: number | null;
  odometer_end: number | null;
  odometer_km: number | null;
  billed_km: number | null;
  planned_km: number | null;
  km_source: string | null;
  wait_minutes: number;
  wait_tolerance: number;
  wait_client_waived: boolean;
  wait_charge: number;
  wait_driver_charge: number;
  wait_client_rate: number | null;
  wait_driver_rate: number | null;
  wait_rate_source: "corrida" | "cliente" | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  client_amount: number | null;
  driver_amount: number | null;
  alert: string | null;
};

type Preview = {
  by_table: boolean;
  km?: number | null;
  base_client?: number | null;
  base_driver?: number | null;
  wait_minutes?: number;
  wait_billable_minutes?: number;
  wait_tolerance_minutes?: number;
  wait_client?: number;
  wait_driver?: number;
  client_amount?: number;
  driver_amount?: number;
};
const money = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2).replace(".", ","));
const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const km = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const place = (t: string | null) => String(t ?? "—").split(" - ")[0].split(",")[0].slice(0, 40);
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—");
/** Atraso do passageiro: do horário marcado (ou da chegada do motorista, se chegou depois) até o início da corrida. */
function lateMinutes(it: { scheduled_at: string; arrived_at: string | null; started_at: string | null }): number {
  if (!it.started_at) return 0;
  const from = Math.max(new Date(it.scheduled_at).getTime(), it.arrived_at ? new Date(it.arrived_at).getTime() : 0);
  return Math.max(0, Math.round((new Date(it.started_at).getTime() - from) / 60000));
}
const dur = (a: string | null, b: string | null) => {
  if (!a || !b) return null;
  const m = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  return m > 0 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : null;
};


type WaitSave = { waived: boolean; rate?: { client: number; driver: number; save_to_client: boolean } };

/** Caixa da espera além da tolerância: escolha clara entre cobrar e cortesia; sem valor cadastrado, pede o valor da hora parada ali mesmo. */
function WaitBox({ it, busy, onSave }: { it: Item; busy: boolean; onSave: (b: WaitSave) => void }) {
  const billable = Math.ceil((it.wait_minutes - it.wait_tolerance) / 5) * 5;
  const hasRate = it.wait_client_rate != null && it.wait_client_rate > 0;
  const [open, setOpen] = useState(false);
  const [rc, setRc] = useState(it.wait_client_rate != null ? money(it.wait_client_rate) : "");
  const [rd, setRd] = useState(it.wait_driver_rate != null ? money(it.wait_driver_rate) : "");
  const [save, setSave] = useState(true);
  const c = rc.trim() ? num(rc) : NaN;
  const d = rd.trim() ? num(rd) : 0;
  const prevC = Number.isFinite(c) ? Math.round((billable / 60) * c * 100) / 100 : null;
  const prevD = Number.isFinite(d) ? Math.round((billable / 60) * d * 100) / 100 : null;
  const charging = !it.wait_client_waived;
  const showForm = open || (charging && !hasRate);
  return (
    <div className="mt-2 rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
      <p className="font-semibold text-amber-900">
        Espera passou da tolerância ({it.wait_tolerance} min): {billable} min a cobrar
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => (hasRate ? onSave({ waived: false }) : setOpen(true))}
          className={`rounded-lg px-2 py-2 text-xs font-bold ring-1 ${charging ? "bg-[#111] text-prime-gold ring-[#111]" : "bg-white text-[#111] ring-amber-300"}`}
        >
          {charging ? "✓ " : ""}Cobrar do cliente
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ waived: true })}
          className={`rounded-lg px-2 py-2 text-xs font-bold ring-1 ${!charging ? "bg-[#111] text-prime-gold ring-[#111]" : "bg-white text-[#111] ring-amber-300"}`}
        >
          {!charging ? "✓ " : ""}Não cobrar (cortesia)
        </button>
      </div>
      <p className="mt-2 text-xs text-amber-900">
        {!charging
          ? "Cortesia: o cliente não paga a espera. O motorista recebe a espera mesmo assim."
          : it.wait_charge > 0
            ? `Cobrando ${brl(it.wait_charge)} do cliente${it.wait_driver_charge > 0 ? ` · motorista recebe +${brl(it.wait_driver_charge)}` : ""} (hora parada ${brl(it.wait_client_rate)}/h).`
            : hasRate
              ? it.client_amount == null
                ? `Hora parada ${brl(it.wait_client_rate)}/h = ${brl(Math.round((billable / 60) * (it.wait_client_rate ?? 0) * 100) / 100)}. A corrida está sem valor: lance em “Corrigir antes de aprovar” já somando a espera.`
                : `Hora parada ${brl(it.wait_client_rate)}/h. Clique em “Cobrar do cliente” para somar a espera.`
              : "Falta o valor da hora parada deste cliente. Informe abaixo:"}
      </p>
      {showForm ? (
        <div className="mt-2 grid gap-2 rounded-lg bg-white p-2.5 ring-1 ring-amber-200">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="font-semibold">Cliente paga (R$ por hora)</span>
              <input inputMode="decimal" value={rc} onChange={(e) => setRc(e.target.value)} placeholder="Ex.: 60,00" className="mt-1 w-full rounded-lg border border-prime-border px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs">
              <span className="font-semibold">Motorista recebe (R$ por hora)</span>
              <input inputMode="decimal" value={rd} onChange={(e) => setRd(e.target.value)} placeholder="Ex.: 40,00" className="mt-1 w-full rounded-lg border border-prime-border px-2 py-1.5 text-sm" />
            </label>
          </div>
          {prevC != null ? (
            <p className="text-xs text-prime-muted">
              {billable} min = cliente {brl(prevC)}
              {prevD ? ` · motorista ${brl(prevD)}` : ""}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Usar este valor nas próximas corridas de {it.client}
          </label>
          <button
            type="button"
            disabled={busy || !Number.isFinite(c) || c <= 0}
            onClick={() => onSave({ waived: false, rate: { client: c, driver: Number.isFinite(d) ? d : 0, save_to_client: save } })}
            className="rounded-lg bg-[#111] px-3 py-2 text-xs font-bold text-prime-gold disabled:opacity-40"
          >
            {busy ? "Salvando…" : "Cobrar a espera com este valor"}
          </button>
        </div>
      ) : hasRate && charging ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs font-semibold text-amber-900 underline">
          Mudar o valor da hora parada
        </button>
      ) : null}
    </div>
  );
}

/** Fila de aprovação: toda corrida finalizada passa pelo gestor antes de ir para fatura e carteira. */
export function TripApprovalQueue() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState({ km: "", client: "", driver: "", wait: "" });
  const [busy, setBusy] = useState<string | null>(null);
  /** Valores digitados à mão (não sobrescreve com o cálculo da tabela). */
  const [manual, setManual] = useState(false);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [calc, setCalc] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession("/api/trips/pending-review", {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Item[] };
    setItems(j.success ? (j.data ?? []) : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Prévia ao vivo: mudou KM ou espera, recalcula pela tabela do cliente (o mesmo que o salvar grava).
  useEffect(() => {
    if (!edit) return;
    const it = items?.find((x) => x.id === edit);
    if (!it) return;
    setCalc(true);
    const t = setTimeout(async () => {
      const q = new URLSearchParams({ preview: "1" });
      if (it.by_km && form.km.trim()) q.set("km", String(num(form.km)));
      if (form.wait.trim()) q.set("wait", String(Math.max(0, Math.round(num(form.wait)))));
      const r = await fetchWithSupabaseSession(`/api/trips/${edit}/km-review?${q}`, {}, "admin");
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Preview };
      setCalc(false);
      if (!j.success || !j.data) return;
      setPrev(j.data);
      if (j.data.by_table && !manual) setForm((f) => ({ ...f, client: money(j.data?.client_amount), driver: money(j.data?.driver_amount) }));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, form.km, form.wait, manual]);

  /** Decisão da espera: cobrar (com o valor da hora parada) ou cortesia. A corrida continua na fila até você aprovar. */
  async function saveWait(it: Item, b: WaitSave) {
    setBusy(it.id);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      `/api/trips/${it.id}/km-review`,
      {
        method: "POST",
        body: JSON.stringify({ choice: "keep", keep_pending: true, wait_client_waived: b.waived, ...(b.rate ? { wait_rate: b.rate } : {}) })
      },
      "admin"
    ).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }) : {};
    setBusy(null);
    if (!r?.ok || !j.success) {
      setMsg({ ok: false, text: j.error?.message ?? "Não foi possível salvar a decisão da espera." });
      return;
    }
    setMsg({
      ok: true,
      text: b.waived
        ? "Espera não será cobrada do cliente (cortesia). O motorista recebe a espera."
        : it.client_amount == null
          ? "Valor da hora parada salvo. A corrida ainda está sem valor: clique em “Corrigir antes de aprovar” e lance o valor."
          : "Espera somada ao valor do cliente e do motorista. Confira e aprove."
    });
    await load();
  }

  async function approve(id: string, silent = false) {
    setBusy(id);
    const r = await fetchWithSupabaseSession(`/api/trips/${id}/review`, { method: "POST" }, "admin");
    setBusy(null);
    if (!silent) setMsg(r.ok ? { ok: true, text: "Corrida aprovada. Motorista e cliente veem “Confirmada pela central”." } : { ok: false, text: "Não foi possível aprovar." });
    return r.ok;
  }

  async function saveEdit(it: Item) {
    setBusy(it.id);
    setMsg(null);
    try {
      const newKm = form.km.trim() ? num(form.km) : null;
      const kmChanged = it.by_km && newKm != null && newKm !== it.billed_km;
      const newWait = form.wait.trim() ? Math.max(0, Math.round(num(form.wait))) : null;
      const waitChanged = newWait != null && newWait !== it.wait_minutes;
      let current = { client: it.client_amount, driver: it.driver_amount };
      if (kmChanged || waitChanged) {
        const r = await fetchWithSupabaseSession(
          `/api/trips/${it.id}/km-review`,
          {
            method: "POST",
            body: JSON.stringify({
              choice: kmChanged ? "manual" : "keep",
              ...(kmChanged ? { km: newKm } : {}),
              ...(waitChanged ? { wait_minutes: newWait } : {}),
              recalc: it.by_km && Boolean(prev?.by_table)
            })
          },
          "admin"
        );
        const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { client_amount: number | null; driver_amount: number | null }; error?: { message?: string } };
        if (!r.ok || !j.success) throw new Error(j.error?.message ?? "Falha ao recalcular");
        current = { client: j.data?.client_amount == null ? null : Number(j.data.client_amount), driver: j.data?.driver_amount == null ? null : Number(j.data.driver_amount) };
      }
      // Valor digitado diferente do calculado: grava o digitado (valor fechado).
      const c = form.client.trim() ? num(form.client) : null;
      const d = form.driver.trim() ? num(form.driver) : null;
      const valuesChanged = (c != null && Math.abs(c - Number(current.client ?? 0)) > 0.004) || (d != null && Math.abs(d - Number(current.driver ?? 0)) > 0.004);
      if (valuesChanged) {
        const r = await fetchWithSupabaseSession(
          `/api/trips/${it.id}/amounts`,
          { method: "PATCH", body: JSON.stringify({ client_amount: c ?? current.client, driver_amount: d ?? current.driver }) },
          "admin"
        );
        if (!r.ok) throw new Error("Falha ao salvar os valores");
      }
      await approve(it.id, true);
      setMsg({ ok: true, text: "Corrigida e aprovada. Para o motorista e o cliente aparece só “Confirmada pela central”." });
      setEdit(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao salvar." });
    } finally {
      setBusy(null);
    }
  }

  async function approveClean() {
    const clean = (items ?? []).filter((i) => !i.alert && i.client_amount != null);
    if (!clean.length || !window.confirm(`Aprovar ${clean.length} corrida(s) sem alerta, com os valores como estão?`)) return;
    for (const it of clean) await approve(it.id, true);
    setMsg({ ok: true, text: `${clean.length} corrida(s) aprovada(s).` });
    await load();
  }

  if (items == null) return <p className="text-sm text-prime-muted">Carregando…</p>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <div>
          <p className="text-2xl font-semibold">
            {items.length} corrida{items.length === 1 ? "" : "s"} para aprovar
          </p>
          <p className="text-sm text-prime-muted">Confira o KM e os valores. Só depois de aprovada a corrida entra na fatura e o motorista vê o valor como confirmado.</p>
        </div>
        {items.some((i) => !i.alert && i.client_amount != null) ? (
          <button type="button" onClick={() => void approveClean()} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-[#fff]">
            ✓ Aprovar todas sem alerta
          </button>
        ) : null}
      </div>
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
      {items.length === 0 ? (
        <p className="rounded-2xl border border-prime-border bg-white p-8 text-center text-prime-muted">✓ Tudo aprovado. Nenhuma corrida esperando conferência.</p>
      ) : null}

      {items.map((it) => {
        const margin = it.client_amount != null && it.driver_amount != null ? it.client_amount - it.driver_amount : null;
        const editing = edit === it.id;
        return (
          <article key={it.id} className={`overflow-hidden rounded-2xl border bg-white shadow-prime-card ${it.alert ? "border-amber-300" : "border-prime-border"}`}>
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-prime-border px-5 py-3">
              <div>
                <p className="text-xs text-prime-muted">
                  {when(it.scheduled_at)}
                  {it.ref ? ` · ${it.ref}` : ""}
                </p>
                <h3 className="font-semibold">
                  {it.client} <span className="font-normal text-prime-muted">· {it.driver ?? "sem motorista"}</span>
                </h3>
                <p className="text-xs text-prime-muted">
                  {place(it.origin)} → {place(it.destination)}
                  {it.passenger ? ` · ${it.passenger}` : ""}
                </p>
              </div>
              <a href={`/agenda?trip=${it.id}`} className="text-sm text-prime-muted hover:underline">
                Abrir corrida →
              </a>
            </header>

            {it.alert ? <p className="bg-amber-50 px-5 py-2 text-sm text-amber-900">⚠ {it.alert}</p> : null}
            {(() => {
              const late = lateMinutes(it);
              const missing = late > it.wait_minutes + 5;
              return (
                <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-prime-border px-5 py-2 text-sm ${missing ? "bg-amber-50" : "bg-prime-bg/40"}`}>
                  <span>
                    🕐 Marcado <b>{hm(it.scheduled_at)}</b>
                  </span>
                  <span>
                    Chegou <b>{hm(it.arrived_at)}</b>
                  </span>
                  <span>
                    Saiu <b>{hm(it.started_at)}</b>
                  </span>
                  <span>
                    Finalizou <b>{hm(it.completed_at)}</b>
                    {dur(it.started_at, it.completed_at) ? <span className="text-prime-muted"> ({dur(it.started_at, it.completed_at)} de viagem)</span> : null}
                  </span>
                  {late > 0 ? (
                    <span className={missing ? "font-semibold text-amber-900" : "text-prime-muted"}>
                      Passageiro saiu {late} min depois do marcado
                      {missing ? ` · espera lançada: ${it.wait_minutes} min, confira e corrija` : ""}
                    </span>
                  ) : null}
                </div>
              );
            })()}

            <div className="grid gap-0 sm:grid-cols-3 sm:divide-x sm:divide-prime-border">
              <section className="px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-prime-muted">1 · O motorista informou</p>
                {it.odometer_km != null ? (
                  <>
                    <p className="mt-1 text-2xl font-semibold">{km(it.odometer_km)}</p>
                    <p className="text-xs text-prime-muted">
                      painel {it.odometer_start?.toLocaleString("pt-BR")} → {it.odometer_end?.toLocaleString("pt-BR")}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-prime-muted">{it.by_km ? "Sem KM do painel" : "Corrida de valor fixo (não depende de KM)"}</p>
                )}
                {it.wait_minutes > 0 ? <p className="mt-1 text-sm">⏱ Espera: {it.wait_minutes} min</p> : null}
                {it.wait_minutes > it.wait_tolerance ? <WaitBox it={it} busy={busy === it.id} onSave={(b) => saveWait(it, b)} /> : null}
                {it.planned_km ? <p className="mt-1 text-xs text-prime-muted">Previsto no mapa: {km(it.planned_km)}</p> : null}
              </section>
              <section className="px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-prime-muted">2 · Vai ser cobrado</p>
                {it.by_km ? <p className="mt-1 text-sm">KM cobrado: <b>{km(it.billed_km)}</b></p> : null}
                <p className="mt-1 text-sm">Cliente paga: <b>{brl(it.client_amount)}</b></p>
                <p className="text-sm">Motorista recebe: <b>{brl(it.driver_amount)}</b></p>
                <p className="text-sm text-prime-muted">Margem: {brl(margin)}</p>
              </section>
              <section className="flex flex-col justify-center gap-2 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-prime-muted">3 · Sua decisão</p>
                <button
                  type="button"
                  disabled={busy === it.id || it.client_amount == null}
                  onClick={() => {
                    void approve(it.id).then(async (okk) => {
                      if (okk) await load();
                    });
                  }}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-[#fff] disabled:opacity-50"
                >
                  ✓ Aprovar como está
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEdit(editing ? null : it.id);
                    setManual(false);
                    setPrev(null);
                    setForm({
                      wait: String(Math.max(it.wait_minutes, lateMinutes(it))),
                      km: it.billed_km != null ? String(it.billed_km).replace(".", ",") : "",
                      client: it.client_amount != null ? it.client_amount.toFixed(2).replace(".", ",") : "",
                      driver: it.driver_amount != null ? it.driver_amount.toFixed(2).replace(".", ",") : ""
                    });
                  }}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ring-prime-border hover:ring-prime-gold"
                >
                  ✎ Corrigir antes de aprovar
                </button>
              </section>
            </div>

            {editing ? (
              <div className="grid gap-4 border-t border-prime-border bg-prime-bg/50 px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {it.by_km ? (
                    <label className="grid content-start gap-1 text-sm">
                      <span className="font-medium">KM a cobrar</span>
                      <input className="w-full rounded-lg border border-prime-border bg-white px-3 py-2 text-base" inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} />
                      <span className="text-[11px] text-prime-muted">O motorista informou {km(it.odometer_km ?? it.billed_km)}</span>
                    </label>
                  ) : null}
                  <label className="grid content-start gap-1 text-sm">
                    <span className="font-medium">Espera / atraso (min)</span>
                    <input className="w-full rounded-lg border border-prime-border bg-white px-3 py-2 text-base" inputMode="numeric" value={form.wait} onChange={(e) => setForm({ ...form, wait: e.target.value })} />
                    <span className="text-[11px] text-prime-muted">
                      {prev?.wait_tolerance_minutes != null ? `Tolerância do cliente: ${prev.wait_tolerance_minutes} min` : "Cobra o que passar da tolerância"}
                    </span>
                  </label>
                  <label className="grid content-start gap-1 text-sm">
                    <span className="font-medium">Cliente paga (R$)</span>
                    <input
                      className="w-full rounded-lg border border-prime-border bg-white px-3 py-2 text-base font-semibold"
                      inputMode="decimal"
                      value={form.client}
                      onChange={(e) => {
                        setManual(true);
                        setForm({ ...form, client: e.target.value });
                      }}
                    />
                    <span className="text-[11px] text-prime-muted">Antes: {brl(it.client_amount)}</span>
                  </label>
                  <label className="grid content-start gap-1 text-sm">
                    <span className="font-medium">Motorista recebe (R$)</span>
                    <input
                      className="w-full rounded-lg border border-prime-border bg-white px-3 py-2 text-base font-semibold"
                      inputMode="decimal"
                      value={form.driver}
                      onChange={(e) => {
                        setManual(true);
                        setForm({ ...form, driver: e.target.value });
                      }}
                    />
                    <span className="text-[11px] text-prime-muted">Antes: {brl(it.driver_amount)}</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-prime-border bg-white px-4 py-3">
                  <div className="min-w-0 text-sm">
                    {calc ? (
                      <span className="text-prime-muted">Recalculando…</span>
                    ) : prev?.by_table ? (
                      <>
                        <p>
                          <b>Pela tabela:</b> {prev.km != null ? `${km(prev.km)} = ` : ""}
                          {brl(prev.base_client ?? null)}
                          {prev.wait_client ? ` + espera ${prev.wait_billable_minutes} min = ${brl(prev.wait_client)}` : prev.wait_minutes ? ` · espera ${prev.wait_minutes} min dentro da tolerância (sem cobrança)` : ""}
                          {" → "}
                          <b>cliente {brl(prev.client_amount ?? null)}</b> · motorista {brl(prev.driver_amount ?? null)}
                          {prev.client_amount != null && prev.driver_amount != null ? ` · margem ${brl(prev.client_amount - prev.driver_amount)}` : ""}
                        </p>
                        {manual ? (
                          <p className="text-amber-800">
                            Você digitou valores à mão; vai salvar os digitados.{" "}
                            <button type="button" onClick={() => setManual(false)} className="font-semibold underline">
                              Usar o cálculo da tabela
                            </button>
                          </p>
                        ) : null}
                      </>
                    ) : prev ? (
                      <span className="text-prime-muted">Corrida de valor fechado: KM e espera não mudam o valor. Se precisar, digite os valores.</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy === it.id || calc}
                    onClick={() => void saveEdit(it)}
                    className="shrink-0 rounded-xl bg-[#111] px-5 py-3 text-sm font-semibold text-[#C9A84C] disabled:opacity-50"
                  >
                    {busy === it.id ? "Salvando…" : "Salvar e aprovar"}
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
