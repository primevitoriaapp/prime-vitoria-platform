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
  client_amount: number | null;
  driver_amount: number | null;
  alert: string | null;
};

const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const km = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const place = (t: string | null) => String(t ?? "—").split(" - ")[0].split(",")[0].slice(0, 40);
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Fila de aprovação: toda corrida finalizada passa pelo gestor antes de ir para fatura e carteira. */
export function TripApprovalQueue() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState({ km: "", client: "", driver: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession("/api/trips/pending-review", {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Item[] };
    setItems(j.success ? (j.data ?? []) : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      if (it.by_km && newKm != null && newKm !== it.billed_km) {
        const r = await fetchWithSupabaseSession(`/api/trips/${it.id}/km-review`, { method: "POST", body: JSON.stringify({ choice: "manual", km: newKm }) }, "admin");
        const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
        if (!r.ok || !j.success) throw new Error(j.error?.message ?? "Falha ao recalcular o KM");
      }
      const c = form.client.trim() ? num(form.client) : null;
      const d = form.driver.trim() ? num(form.driver) : null;
      const valuesChanged = (c != null && c !== it.client_amount) || (d != null && d !== it.driver_amount);
      if (valuesChanged) {
        const r = await fetchWithSupabaseSession(
          `/api/trips/${it.id}/amounts`,
          { method: "PATCH", body: JSON.stringify({ client_amount: c ?? it.client_amount, driver_amount: d ?? it.driver_amount }) },
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
                  onClick={() => void approve(it.id).then((okk) => okk && load())}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-[#fff] disabled:opacity-50"
                >
                  ✓ Aprovar como está
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEdit(editing ? null : it.id);
                    setForm({
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
              <div className="grid gap-3 border-t border-prime-border bg-prime-bg/50 px-5 py-4 sm:grid-cols-4 sm:items-end">
                {it.by_km ? (
                  <label className="grid gap-1 text-sm">
                    KM a cobrar
                    <input className="rounded-lg border border-prime-border bg-white px-3 py-2" inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} />
                    <span className="text-[11px] text-prime-muted">Recalcula pela tabela do cliente</span>
                  </label>
                ) : null}
                <label className="grid gap-1 text-sm">
                  Cliente paga (R$)
                  <input className="rounded-lg border border-prime-border bg-white px-3 py-2" inputMode="decimal" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                </label>
                <label className="grid gap-1 text-sm">
                  Motorista recebe (R$)
                  <input className="rounded-lg border border-prime-border bg-white px-3 py-2" inputMode="decimal" value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value })} />
                </label>
                <button
                  type="button"
                  disabled={busy === it.id}
                  onClick={() => void saveEdit(it)}
                  className="rounded-xl bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#C9A84C] disabled:opacity-50"
                >
                  {busy === it.id ? "Salvando…" : "Salvar e aprovar"}
                </button>
                <p className="text-xs text-prime-muted sm:col-span-4">
                  Mudou só o KM? Deixe os valores como estão: o sistema recalcula. Quer um valor fechado? Digite os valores. Motorista e cliente não veem que houve ajuste.
                </p>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
