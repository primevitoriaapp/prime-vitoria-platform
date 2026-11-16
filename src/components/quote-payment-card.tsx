"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { BookingPaymentFields, bookingPaymentBody, emptyBookingPayment, type BookingPaymentDraft } from "@/components/booking-payment-form";
import { paymentLabel } from "@/lib/finance/booking-payments-core";

type Summary = { total: number; paid: number; balance: number; payments: { id: string; amount: number; method: string; account: string | null; installments: number | null; paid_on: string }[] };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Antes de aprovar: "o cliente já pagou?" (o pagamento entra junto com as corridas). */
export function QuotePrepayFields({ prepaid, onPrepaid, value, onChange, total }: { prepaid: boolean; onPrepaid: (v: boolean) => void; value: BookingPaymentDraft; onChange: (v: BookingPaymentDraft) => void; total: number }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <label className="flex items-center gap-2 text-base font-semibold">
        <input type="checkbox" checked={prepaid} onChange={(e) => onPrepaid(e.target.checked)} />
        💰 O cliente já pagou? (total ou sinal)
      </label>
      {prepaid ? (
        <>
          <BookingPaymentFields value={value} onChange={onChange} total={total} />
          <p className="text-xs text-prime-muted">O pagamento é registrado nas corridas assim que você tocar em “Cliente aprovou”.</p>
        </>
      ) : null}
    </section>
  );
}

/** Depois de aprovado: quanto já pagou, o saldo e o botão para registrar um pagamento. */
export function QuotePaymentCard({ tripIds }: { tripIds: string[] }) {
  const [s, setS] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BookingPaymentDraft>(() => emptyBookingPayment(today()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const first = tripIds[0];

  const load = useCallback(async () => {
    if (!first) return;
    const r = await fetchWithSupabaseSession(`/api/trips/${first}/payments`, {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { data?: Summary };
    if (j.data) setS(j.data);
  }, [first]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const body = bookingPaymentBody(draft, tripIds);
    if (!body || !first) {
      setMsg("Informe o valor pago.");
      return;
    }
    setBusy(true);
    const r = await fetchWithSupabaseSession(`/api/trips/${first}/payments`, { method: "POST", body: JSON.stringify(body) }, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!r.ok || !j.success) {
      setMsg(j.error?.message ?? "Não foi possível registrar.");
      return;
    }
    setMsg("Pagamento registrado.");
    setOpen(false);
    setDraft(emptyBookingPayment(today()));
    void load();
  }

  if (!first) return null;
  const quitado = s && s.total > 0 && s.balance <= 0;
  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold">💰 Pagamento do cliente</p>
        {s ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${quitado ? "bg-emerald-100 text-emerald-800" : s.paid > 0 ? "bg-amber-100 text-amber-900" : "bg-[#F1EFEA] text-prime-muted"}`}>
            {quitado ? "✓ Pago" : s.paid > 0 ? `Pago ${brl(s.paid)} · falta ${brl(s.balance)}` : "Nada pago ainda"}
          </span>
        ) : null}
      </div>
      {s?.payments.length ? (
        <ul className="divide-y divide-prime-border text-sm">
          {s.payments.map((p) => (
            <li key={p.id} className="flex justify-between py-1.5">
              <span>
                {new Date(`${p.paid_on}T12:00:00Z`).toLocaleDateString("pt-BR")} · {paymentLabel(p as never)}
              </span>
              <b>{brl(Number(p.amount))}</b>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <>
          <BookingPaymentFields value={draft} onChange={setDraft} total={s?.balance ?? null} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} className="btn-primary" onClick={() => void save()}>
              {busy ? "Salvando…" : "Registrar pagamento"}
            </button>
            <button type="button" className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : !quitado ? (
        <button type="button" className="w-fit rounded-lg bg-white px-4 py-2 text-sm font-semibold ring-1 ring-prime-border hover:ring-prime-gold" onClick={() => setOpen(true)}>
          ＋ Registrar que o cliente pagou
        </button>
      ) : null}
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
    </section>
  );
}
