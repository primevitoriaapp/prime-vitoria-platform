"use client";

import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { BOOKING_PAYMENT_ACCOUNTS, BOOKING_PAYMENT_METHODS, type BookingPaymentMethod } from "@/lib/finance/booking-payments-core";

export type BookingPaymentDraft = {
  amount: string;
  method: BookingPaymentMethod;
  account: string;
  installments: string;
  fee: string;
  paid_on: string;
  notes: string;
};

export function emptyBookingPayment(today: string): BookingPaymentDraft {
  return { amount: "", method: "pix", account: "", installments: "", fee: "", paid_on: today, notes: "" };
}

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Corpo para POST /api/trips/[id]/payments. Null se o valor não foi preenchido. */
export function bookingPaymentBody(d: BookingPaymentDraft, tripIds?: string[]) {
  const amount = num(d.amount);
  if (!(amount > 0)) return null;
  return {
    ...(tripIds ? { trip_ids: tripIds } : {}),
    amount,
    method: d.method,
    account: d.account.trim() || null,
    installments: d.installments ? Number(d.installments) : null,
    fee_amount: d.fee.trim() ? num(d.fee) : null,
    paid_on: d.paid_on,
    notes: d.notes.trim() || null
  };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Campos do pagamento: quanto, como, onde caiu e quando. `total` mostra atalhos de 50% e 100%. */
export function BookingPaymentFields({ value, onChange, total }: { value: BookingPaymentDraft; onChange: (v: BookingPaymentDraft) => void; total?: number | null }) {
  const set = (patch: Partial<BookingPaymentDraft>) => onChange({ ...value, ...patch });
  const card = value.method === "cartao_credito" || value.method === "link_pagamento";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Quanto pagou (R$)</span>
        <input className={`${PRIME_INPUT_CLASS} text-lg font-semibold`} inputMode="decimal" placeholder="0,00" value={value.amount} onChange={(e) => set({ amount: e.target.value })} />
        {total && total > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {[50, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => set({ amount: (Math.round(total * pct) / 100).toFixed(2).replace(".", ",") })}
                className="rounded-full px-2.5 py-1 text-xs ring-1 ring-prime-gold"
              >
                {pct}% = {brl(Math.round(total * pct) / 100)}
              </button>
            ))}
          </span>
        ) : null}
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Pagou com</span>
        <select className={PRIME_INPUT_CLASS} value={value.method} onChange={(e) => set({ method: e.target.value as BookingPaymentMethod })}>
          {Object.entries(BOOKING_PAYMENT_METHODS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Onde caiu o dinheiro</span>
        <input className={PRIME_INPUT_CLASS} list="booking-payment-accounts" placeholder="Ex.: InfinitePay, Conta Sicoob" value={value.account} onChange={(e) => set({ account: e.target.value })} />
        <datalist id="booking-payment-accounts">
          {BOOKING_PAYMENT_ACCOUNTS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Data do pagamento</span>
        <input type="date" className={PRIME_INPUT_CLASS} value={value.paid_on} onChange={(e) => set({ paid_on: e.target.value })} />
      </label>
      {card ? (
        <>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Parcelas</span>
            <input className={PRIME_INPUT_CLASS} inputMode="numeric" placeholder="1" value={value.installments} onChange={(e) => set({ installments: e.target.value.replace(/\D/g, "") })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Taxa da maquininha / link (R$, opcional)</span>
            <input className={PRIME_INPUT_CLASS} inputMode="decimal" placeholder="0,00" value={value.fee} onChange={(e) => set({ fee: e.target.value })} />
          </label>
        </>
      ) : null}
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Observação (opcional)</span>
        <input className={PRIME_INPUT_CLASS} placeholder="Ex.: comprovante no WhatsApp, restante no último dia" value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
    </div>
  );
}
