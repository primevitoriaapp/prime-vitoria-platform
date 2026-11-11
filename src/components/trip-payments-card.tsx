"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { saoPauloTodayYmd } from "@/lib/dates/br-date";
import { paymentLabel, type PackageSummary } from "@/lib/finance/booking-payments-core";
import { PaymentLinksCard } from "@/components/payment-links-card";
import { BookingPaymentFields, bookingPaymentBody, emptyBookingPayment } from "@/components/booking-payment-form";

type Data = PackageSummary & { trip_ids: string[]; allocated_here: number };
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");

/** Pagamento do cliente na reserva: quanto já recebeu, como, onde, e quanto falta (pacote inteiro). */
export function TripPaymentsCard({ tripId }: { tripId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyBookingPayment(saoPauloTodayYmd()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/payments`, {}, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Data };
    if (j.success && j.data) setD(j.data);
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const body = bookingPaymentBody(form);
    if (!body) return setMsg({ ok: false, text: "Digite o valor pago." });
    setBusy(true);
    setMsg(null);
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/payments`, { method: "POST", body: JSON.stringify(body) }, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Data; error?: { message?: string } };
    setBusy(false);
    if (!r.ok || !j.success || !j.data) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível salvar." });
    setD(j.data);
    setOpen(false);
    setForm(emptyBookingPayment(saoPauloTodayYmd()));
    setMsg({ ok: true, text: "Pagamento registrado." });
  }

  async function remove(id: string) {
    if (!window.confirm("Apagar este pagamento? Use só se foi lançado errado.")) return;
    const r = await fetchWithSupabaseSession(`/api/trips/${tripId}/payments?payment_id=${id}`, { method: "DELETE" }, "admin");
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Data };
    if (j.success && j.data) setD(j.data);
  }

  if (!d) return null;
  const has = d.payments.length > 0;
  const pkg = d.trip_count > 1;

  return (
    <section className={`rounded-2xl border bg-white p-4 shadow-prime-card ${has ? (d.balance <= 0.01 ? "border-emerald-300" : "border-prime-gold") : "border-prime-border"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Pagamento do cliente {pkg ? `(pacote de ${d.trip_count} corridas)` : ""}</h3>
        {has ? (
          d.balance <= 0.01 && d.missing_amount === 0 ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">✓ Tudo pago</span>
          ) : (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Falta receber {brl(d.balance)}</span>
          )
        ) : (
          <span className="text-xs text-prime-muted">Nada recebido antecipado</span>
        )}
      </div>

      {has ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-prime-bg p-3">
              <p className="text-xs text-prime-muted">Total {pkg ? "do pacote" : "da corrida"}</p>
              <p className="text-lg font-semibold">{brl(d.total)}</p>
              {d.missing_amount ? <p className="text-[11px] text-amber-800">{d.missing_amount} sem valor ainda</p> : null}
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs text-emerald-800">Já recebido</p>
              <p className="text-lg font-semibold text-emerald-900">{brl(d.paid)}</p>
            </div>
            <div className="rounded-xl bg-[#111] p-3 text-[#fff]">
              <p className="text-xs text-[#C8C3B8]">Falta receber</p>
              <p className="text-lg font-semibold text-[#C9A84C]">{brl(d.balance)}</p>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-prime-border rounded-xl border border-prime-border">
            {d.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <b>{brl(p.amount)}</b> · {brDate(p.paid_on)} · {paymentLabel(p)}
                  {p.fee_amount ? <span className="text-prime-muted"> · taxa {brl(p.fee_amount)}</span> : null}
                  {p.notes ? <span className="block text-xs text-prime-muted">{p.notes}</span> : null}
                </span>
                <button type="button" onClick={() => void remove(p.id)} className="text-xs text-red-700 hover:underline">
                  apagar
                </button>
              </li>
            ))}
          </ul>
          {pkg ? <p className="mt-2 text-xs text-prime-muted">Desta corrida, {brl(d.allocated_here)} já está coberto pelo que foi pago (o pago quita os primeiros dias primeiro).</p> : null}
        </>
      ) : null}

      {open ? (
        <div className="mt-3 grid gap-3 rounded-xl bg-prime-bg/60 p-3">
          <BookingPaymentFields value={form} onChange={setForm} total={d.balance > 0 ? d.balance : d.total} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-[#C9A84C] disabled:opacity-50">
              {busy ? "Salvando…" : "Salvar pagamento"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm ring-1 ring-prime-border">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-prime-gold">
          + Registrar pagamento recebido
        </button>
      )}
      {msg ? <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p> : null}
      {d.total > 0 ? (
        <div className="mt-3">
          <PaymentLinksCard tripId={tripId} total={d.total} />
        </div>
      ) : null}
    </section>
  );
}
