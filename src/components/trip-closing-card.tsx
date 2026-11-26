"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { ClientRefPicker } from "@/components/client-ref-picker";
import { TRIP_EXTRA_LABEL, type TripExtraKind } from "@/lib/trips/trip-extras";

type Extra = { id: string; kind: TripExtraKind; line: string; client_amount: number; driver_amount: number };
type Data = {
  status: string;
  scheduled_at: string;
  charge_after_cancel: boolean;
  charge_reason: "no_show" | "cancelamento_tardio" | "outro" | null;
  client_id: string | null;
  client_ref: string | null;
  client_amount: number | null;
  driver_amount: number | null;
  has_driver: boolean;
  invoice: { id: string; number: number; status: string } | null;
  app_wait: { minutes: number; billable_minutes: number; amount: number } | null;
  hour_rate: { client: number; driver: number | null } | null;
  extras: Extra[];
};

const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const parseMoney = (s: string) => {
  const t = s.trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "");
const TIMED: TripExtraKind[] = ["hora_extra", "espera"];

/**
 * Fechamento da corrida: NR do cliente (igual ao voucher) e adicionais lançados pela central
 * (hora extra, espera, estacionamento, pedágio). O cliente e o motorista não veem a edição.
 */
export function TripClosingCard({ tripId, compact = false, hideRef = false, onChanged }: { tripId: string; compact?: boolean; hideRef?: boolean; onChanged?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [ref, setRef] = useState("");
  const [editRef, setEditRef] = useState(false);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<TripExtraKind>("hora_extra");
  const [hours, setHours] = useState("1");
  const [mins, setMins] = useState("0");
  const [desc, setDesc] = useState("");
  const [cli, setCli] = useState("");
  const [payDriver, setPayDriver] = useState(true);
  const [drv, setDrv] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/extras`, {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (j?.success) {
      setD(j.data);
      setRef(j.data.client_ref ?? "");
    }
  }, [tripId]);
  useEffect(() => {
    void load();
  }, [load]);

  const minutes = (Number(hours) || 0) * 60 + (Number(mins) || 0);
  // Valor sugerido pela tabela do cliente (hora extra × tempo) enquanto a pessoa não digitar outro.
  useEffect(() => {
    if (touched || !d) return;
    if (TIMED.includes(kind) && d.hour_rate) {
      setCli(fmt((d.hour_rate.client * minutes) / 60));
      setDrv(d.hour_rate.driver != null ? fmt((d.hour_rate.driver * minutes) / 60) : "");
    } else if (!TIMED.includes(kind)) {
      setCli("");
      setDrv("");
    }
    setPayDriver(kind !== "outro");
  }, [kind, minutes, d, touched]);

  if (!d) return null;
  const locked = Boolean(d.invoice);

  async function saveRef() {
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession("/api/client-invoices/set-ref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip_id: tripId, ref: ref.trim() }) }, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setEditRef(false);
      setMsg({ ok: true, text: `NR gravada: ${j.data.ref}` });
      void load();
      onChanged?.();
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível gravar a NR." });
  }

  async function addExtra() {
    const c = parseMoney(cli);
    const dv = payDriver ? parseMoney(drv || "0") : 0;
    if (!(c >= 0) || Number.isNaN(c)) return setMsg({ ok: false, text: "Digite o valor que o cliente vai pagar." });
    if (payDriver && Number.isNaN(dv)) return setMsg({ ok: false, text: "Digite o valor do motorista (ou desmarque)." });
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/extras`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, minutes: TIMED.includes(kind) ? minutes : null, description: desc.trim() || null, client_amount: c, driver_amount: dv })
      },
      "admin"
    ).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setAdding(false);
      setDesc("");
      setTouched(false);
      setMsg({ ok: true, text: `Adicional lançado. Valor da corrida agora: ${brl(j.data.client_amount)}` });
      void load();
      onChanged?.();
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível lançar." });
  }

  async function removeExtra(e: Extra) {
    if (!window.confirm(`Tirar "${e.line}" (${brl(e.client_amount)}) desta corrida?`)) return;
    setBusy(true);
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/extras?extra=${e.id}`, { method: "DELETE" }, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      void load();
      onChanged?.();
    } else setMsg({ ok: false, text: j?.error?.message ?? "Não foi possível tirar." });
  }

  const box = compact ? "grid gap-3" : "grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card";
  const input = "rounded-xl border border-prime-border px-3 py-2 text-base md:text-sm";
  return (
    <section className={box}>
      {!compact ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Fechamento · NR e adicionais</h3>
          <span className="text-sm text-prime-muted">
            Cliente paga <b className="text-prime-text">{brl(d.client_amount)}</b>
            {d.has_driver ? <> · motorista {brl(d.driver_amount)}</> : null}
          </span>
        </div>
      ) : null}
      {locked ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Esta corrida já está na fatura nº {d.invoice?.number}. Para lançar ou tirar adicional, tire a corrida da fatura antes.
        </p>
      ) : null}

      {/* NR */}
      <div className={hideRef ? "hidden" : "grid gap-2 rounded-xl bg-prime-bg p-3"}>
        {editRef || !d.client_ref ? (
          <>
            <ClientRefPicker clientId={d.client_id} value={ref} onChange={setRef} />
            <div className="flex gap-2">
              <button type="button" disabled={busy || ref.trim().length < 2} onClick={() => void saveRef()} className="rounded-xl bg-[#111] px-4 py-2 text-sm font-semibold text-prime-gold disabled:opacity-40">
                Gravar NR
              </button>
              {d.client_ref ? (
                <button type="button" onClick={() => setEditRef(false)} className="rounded-xl px-3 py-2 text-sm ring-1 ring-prime-border">
                  Cancelar
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>
              NR do cliente: <b className="rounded-md bg-[#111] px-2 py-0.5 text-[#D9BC6A]">{d.client_ref}</b>
            </span>
            <button type="button" onClick={() => setEditRef(true)} className="text-xs font-semibold text-prime-gold-ink">
              Trocar
            </button>
          </div>
        )}
      </div>

      {OPEN_STATUS.includes(d.status) && new Date(d.scheduled_at).getTime() < Date.now() + 30 * 60000 ? (
        <CompleteByCentral tripId={tripId} hasDriver={d.has_driver} onDone={() => {
          void load();
          onChanged?.();
        }} />
      ) : null}

      {d.status === "cancelled" || d.status === "no_show" ? (
        <CancelCharge tripId={tripId} d={d} locked={locked} onDone={() => {
          void load();
          onChanged?.();
        }} />
      ) : null}

      {/* Adicionais */}
      <div className={d.status === "cancelled" || d.status === "no_show" ? "hidden" : "grid gap-2"}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Adicionais</span>
          {!locked && !adding ? (
            <button type="button" onClick={() => setAdding(true)} className="rounded-xl bg-[#111] px-3 py-1.5 text-sm font-semibold text-prime-gold">
              + Adicional
            </button>
          ) : null}
        </div>
        {d.app_wait && !d.extras.some((e) => TIMED.includes(e.kind)) ? (
          <p className="text-xs text-prime-muted">
            O app registrou espera de {d.app_wait.minutes} min ({brl(d.app_wait.amount)} já somado). Se lançar hora extra ou espera aqui, o seu valor substitui o do app.
          </p>
        ) : null}
        {d.extras.length ? (
          <ul className="divide-y divide-prime-border rounded-xl border border-prime-border text-sm">
            {d.extras.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  {e.line}
                  <span className="block text-xs text-prime-muted">
                    cliente {brl(e.client_amount)}
                    {e.driver_amount ? ` · motorista ${brl(e.driver_amount)}` : " · motorista não recebe"}
                  </span>
                </span>
                {!locked ? (
                  <button type="button" disabled={busy} onClick={() => void removeExtra(e)} className="shrink-0 text-xs font-semibold text-red-700">
                    Tirar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !adding ? (
          <p className="text-xs text-prime-muted">Nenhum. Use para hora extra, espera, estacionamento ou pedágio que precisam entrar na cobrança.</p>
        ) : null}

        {adding ? (
          <div className="grid gap-2 rounded-xl border border-prime-gold bg-[#FFFDF7] p-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TRIP_EXTRA_LABEL) as TripExtraKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setTouched(false);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${kind === k ? "bg-[#111] text-[#D9BC6A]" : "bg-white ring-1 ring-prime-border"}`}
                >
                  {k === "outro" ? "Outro" : TRIP_EXTRA_LABEL[k]}
                </button>
              ))}
            </div>
            {TIMED.includes(kind) ? (
              <div className="flex items-end gap-2">
                <label className="grid gap-1">
                  <span className="text-xs">Horas</span>
                  <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} className={`${input} w-20`} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs">Minutos</span>
                  <input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} className={`${input} w-20`} />
                </label>
                <span className="pb-2 text-xs text-prime-muted">{d.hour_rate ? `tabela: ${brl(d.hour_rate.client)}/h` : "sem hora extra na tabela deste cliente"}</span>
              </div>
            ) : null}
            <label className="grid gap-1">
              <span className="text-xs">{kind === "outro" ? "O que é (aparece na fatura)" : "Motivo (opcional, aparece na fatura)"}</span>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} className={input} placeholder={kind === "hora_extra" ? "Ex.: parada extra a pedido do passageiro" : ""} />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs font-semibold">Cliente paga (R$)</span>
                <input
                  inputMode="decimal"
                  value={cli}
                  onChange={(e) => {
                    setCli(e.target.value);
                    setTouched(true);
                  }}
                  className={input}
                />
              </label>
              <div className="grid gap-1">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={payDriver} onChange={(e) => setPayDriver(e.target.checked)} /> Motorista recebe
                </label>
                {payDriver ? (
                  <input
                    inputMode="decimal"
                    value={drv}
                    onChange={(e) => {
                      setDrv(e.target.value);
                      setTouched(true);
                    }}
                    className={input}
                    placeholder="R$"
                  />
                ) : null}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void addExtra()} className="rounded-xl bg-[#111] px-4 py-2 font-semibold text-prime-gold disabled:opacity-40">
                {busy ? "Lançando…" : "Lançar adicional"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setTouched(false);
                }}
                className="rounded-xl px-3 py-2 ring-1 ring-prime-border"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}
    </section>
  );
}

const REASON: Record<string, string> = { no_show: "No-show (passageiro não compareceu)", cancelamento_tardio: "Cancelamento em cima da hora", outro: "Outro motivo" };

/** Corrida cancelada / no-show: cobrar do cliente mesmo assim (e pagar o motorista, se ele foi). */
function CancelCharge({ tripId, d, locked, onDone }: { tripId: string; d: Data; locked: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"no_show" | "cancelamento_tardio" | "outro">(d.charge_reason ?? (d.status === "no_show" ? "no_show" : "cancelamento_tardio"));
  const [cli, setCli] = useState(d.client_amount ? fmt(d.client_amount) : "");
  const [drv, setDrv] = useState(d.driver_amount ? fmt(d.driver_amount) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(charge: boolean) {
    setBusy(true);
    setErr(null);
    const body = charge ? { charge, reason, client_amount: parseMoney(cli), driver_amount: d.has_driver ? parseMoney(drv || "0") : 0 } : { charge };
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/cancel-charge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setOpen(false);
      onDone();
    } else setErr(j?.error?.message ?? "Não foi possível salvar.");
  }

  const input = "rounded-xl border border-prime-border px-3 py-2 text-base md:text-sm";
  if (d.charge_after_cancel && !open) {
    return (
      <div className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        <p>
          💰 <b>Será cobrada do cliente</b> · {REASON[d.charge_reason ?? "outro"]} · <b>{brl(d.client_amount)}</b>
          {d.has_driver ? <> · motorista recebe {brl(d.driver_amount)}</> : null}
        </p>
        <p className="text-xs text-amber-900">Ela entra no fechamento como os outros serviços, com o motivo escrito na fatura.</p>
        {!locked ? (
          <div className="flex gap-3">
            <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-prime-gold-ink">
              Mudar valores
            </button>
            <button type="button" disabled={busy} onClick={() => window.confirm("Não cobrar mais esta corrida? Ela sai do fechamento.") && void send(false)} className="text-xs font-semibold text-red-700">
              Não cobrar
            </button>
          </div>
        ) : null}
        {err ? <p className="text-xs text-red-700">{err}</p> : null}
      </div>
    );
  }
  if (!open) {
    return (
      <div className="grid gap-2 rounded-xl bg-prime-bg p-3 text-sm">
        <p>
          Esta corrida está <b>{d.status === "no_show" ? "como no-show" : "cancelada"}</b> e não entra na fatura.
        </p>
        {!locked ? (
          <button type="button" onClick={() => setOpen(true)} className="justify-self-start rounded-xl bg-[#111] px-4 py-2 font-semibold text-prime-gold">
            💰 Cobrar mesmo assim (no-show / cancelamento)
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-xl border border-prime-gold bg-[#FFFDF7] p-3 text-sm">
      <span className="font-semibold">Cobrar esta corrida do cliente</span>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(REASON) as (keyof typeof REASON)[]).map((k) => (
          <button key={k} type="button" onClick={() => setReason(k as typeof reason)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${reason === k ? "bg-[#111] text-[#D9BC6A]" : "bg-white ring-1 ring-prime-border"}`}>
            {REASON[k]}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Cliente paga (R$)</span>
          <input inputMode="decimal" value={cli} onChange={(e) => setCli(e.target.value)} className={input} />
        </label>
        {d.has_driver ? (
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Motorista recebe (R$) — 0 se ele não foi</span>
            <input inputMode="decimal" value={drv} onChange={(e) => setDrv(e.target.value)} className={input} />
          </label>
        ) : null}
      </div>
      <p className="text-xs text-prime-muted">Na fatura aparece o serviço com “{reason === "no_show" ? "NO-SHOW (passageiro não compareceu)" : "Cancelamento em cima da hora"}”.</p>
      {err ? <p className="text-xs text-red-700">{err}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void send(true)} className="rounded-xl bg-[#111] px-4 py-2 font-semibold text-prime-gold disabled:opacity-40">
          {busy ? "Salvando…" : "Cobrar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 ring-1 ring-prime-border">
          Cancelar
        </button>
      </div>
    </div>
  );
}

const OPEN_STATUS = ["approved", "dispatched", "accepted", "on_the_way", "arrived", "in_progress", "reassigned"];

/** Motorista não registrou no app (sem sinal, esqueceu): a central confirma que a corrida foi feita. */
function CompleteByCentral({ tripId, hasDriver, onDone }: { tripId: string; hasDriver: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [km, setKm] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    const r = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/complete-by-central`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actual_km: km.trim() ? Number(km.replace(",", ".")) : null, reason: reason.trim() || null }) },
      "admin"
    ).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setOpen(false);
      onDone();
      window.location.reload();
    } else setErr(j?.error?.message ?? "Não foi possível concluir.");
  }
  const input = "rounded-xl border border-prime-border px-3 py-2 text-base md:text-sm";
  if (!open)
    return (
      <div className="grid gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
        <p>O horário desta corrida já passou e ela não foi finalizada no app do motorista.</p>
        <button type="button" onClick={() => setOpen(true)} className="justify-self-start rounded-xl bg-[#111] px-4 py-2 font-semibold text-prime-gold">
          ✅ A corrida foi feita — concluir pela central
        </button>
      </div>
    );
  return (
    <div className="grid gap-2 rounded-xl border border-prime-gold bg-[#FFFDF7] p-3 text-sm">
      <span className="font-semibold">Concluir pela central</span>
      {!hasDriver ? <p className="text-xs text-red-700">Antes, escolha na corrida o motorista que fez o serviço.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs">KM rodado (opcional)</span>
          <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^0-9.,]/g, ""))} className={input} placeholder="Ex.: 140" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs">O que aconteceu (opcional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} placeholder="Ex.: motorista sem sinal, não iniciou no app" />
        </label>
      </div>
      <p className="text-xs text-prime-muted">A corrida fica concluída, entra no financeiro (cliente e motorista) e vai para “Aprovar corridas” para você conferir. O passageiro não recebe aviso.</p>
      {err ? <p className="text-xs text-red-700">{err}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy || !hasDriver} onClick={() => void go()} className="rounded-xl bg-[#111] px-4 py-2 font-semibold text-prime-gold disabled:opacity-40">
          {busy ? "Concluindo…" : "Concluir"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 ring-1 ring-prime-border">
          Cancelar
        </button>
      </div>
    </div>
  );
}
