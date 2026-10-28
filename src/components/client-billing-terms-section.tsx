"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BILLING_ISSUER_OPTIONS, calculateWaitCharge } from "@/lib/clients/billing-terms-calc";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";

type Props = {
  clientId: string;
  disabled?: boolean;
};

type FormState = {
  wait_tolerance_minutes: string;
  wait_client_price_per_hour: string;
  wait_driver_price_per_hour: string;
  payment_term_days: string;
  billing_issuer: string;
  invoice_closing_day: string;
  invoice_auto_close: boolean;
  invoiced: boolean;
};

const TERM_PRESETS = [
  { value: "0", label: "À vista" },
  { value: "10", label: "10 dias" },
  { value: "15", label: "15 dias" },
  { value: "20", label: "20 dias" },
  { value: "30", label: "30 dias" },
  { value: "45", label: "45 dias" },
  { value: "60", label: "60 dias" }
];

function toForm(d: Record<string, unknown> | undefined): FormState {
  const s = (v: unknown, fallback = "") => (v == null ? fallback : String(v));
  return {
    wait_tolerance_minutes: s(d?.wait_tolerance_minutes, "15"),
    wait_client_price_per_hour: s(d?.wait_client_price_per_hour),
    wait_driver_price_per_hour: s(d?.wait_driver_price_per_hour),
    payment_term_days: s(d?.payment_term_days, "30"),
    billing_issuer: s(d?.billing_issuer),
    invoice_closing_day: s(d?.invoice_closing_day, "0"),
    invoice_auto_close: d?.invoice_auto_close !== false,
    invoiced: d?.invoiced !== false
  };
}

function numOrNull(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Cadastro do cliente → hora parada, prazo de pagamento e CNPJ emitente. */
export function ClientBillingTermsSection({ clientId, disabled }: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(undefined));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession(`/api/clients/${clientId}/billing-terms`, {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Record<string, unknown> };
    if (res.ok && json.success) setForm(toForm(json.data));
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const body = {
      wait_tolerance_minutes: Math.round(numOrNull(form.wait_tolerance_minutes) ?? 15),
      wait_client_price_per_hour: numOrNull(form.wait_client_price_per_hour),
      wait_driver_price_per_hour: numOrNull(form.wait_driver_price_per_hour),
      payment_term_days: numOrNull(form.payment_term_days) == null ? null : Math.round(numOrNull(form.payment_term_days)!),
      billing_issuer: form.billing_issuer || null,
      invoice_closing_day: Number(form.invoice_closing_day) || 0,
      invoice_auto_close: form.invoice_auto_close,
      invoiced: form.invoiced
    };
    const res = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/billing-terms`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      "admin"
    );
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: Record<string, unknown>;
      error?: { message?: string };
    };
    setBusy(false);
    if (!res.ok || !json.success) {
      setMessage({ kind: "error", text: json.error?.message ?? "Não foi possível salvar. Confira os valores e tente de novo." });
      return;
    }
    setForm(toForm(json.data));
    setMessage({ kind: "success", text: "Cobrança salva." });
  }

  const example = calculateWaitCharge(45, {
    wait_tolerance_minutes: numOrNull(form.wait_tolerance_minutes) ?? 15,
    wait_client_price_per_hour: numOrNull(form.wait_client_price_per_hour),
    wait_driver_price_per_hour: numOrNull(form.wait_driver_price_per_hour)
  });

  const off = disabled || busy || loading;

  return (
    <section className="card space-y-4 md:col-span-2">
      <div>
        <h3 className="text-base font-semibold text-prime-text">Hora parada, prazo, fechamento e emitente</h3>
        <p className="mt-1 text-sm text-prime-muted">
          Valem para todas as corridas deste cliente. A hora parada entra no valor final quando a corrida é finalizada.
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Hora parada cobrada do cliente (R$/hora)</span>
          <input
            id="wait-client-rate"
            inputMode="decimal"
            className={PRIME_INPUT_CLASS}
            value={form.wait_client_price_per_hour}
            onChange={(e) => setForm((f) => ({ ...f, wait_client_price_per_hour: e.target.value }))}
            placeholder="Ex.: 45,00"
            disabled={off}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Hora parada paga ao parceiro (R$/hora)</span>
          <input
            id="wait-driver-rate"
            inputMode="decimal"
            className={PRIME_INPUT_CLASS}
            value={form.wait_driver_price_per_hour}
            onChange={(e) => setForm((f) => ({ ...f, wait_driver_price_per_hour: e.target.value }))}
            placeholder="Ex.: 30,00"
            disabled={off}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Tolerância sem cobrança (minutos)</span>
          <input
            id="wait-tolerance"
            inputMode="numeric"
            className={PRIME_INPUT_CLASS}
            value={form.wait_tolerance_minutes}
            onChange={(e) => setForm((f) => ({ ...f, wait_tolerance_minutes: e.target.value }))}
            disabled={off}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Prazo de pagamento</span>
          <select
            id="payment-term"
            className={PRIME_INPUT_CLASS}
            value={TERM_PRESETS.some((p) => p.value === form.payment_term_days) ? form.payment_term_days : "custom"}
            onChange={(e) =>
              setForm((f) => ({ ...f, payment_term_days: e.target.value === "custom" ? f.payment_term_days : e.target.value }))
            }
            disabled={off}
          >
            {TERM_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            {!TERM_PRESETS.some((p) => p.value === form.payment_term_days) ? (
              <option value="custom">{form.payment_term_days ? `${form.payment_term_days} dias` : "Sem prazo"}</option>
            ) : null}
          </select>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span>CNPJ da Prime que fatura este cliente</span>
          <select
            id="billing-issuer"
            className={PRIME_INPUT_CLASS}
            value={form.billing_issuer}
            onChange={(e) => setForm((f) => ({ ...f, billing_issuer: e.target.value }))}
            disabled={off}
          >
            <option value="">Escolha a empresa</option>
            {BILLING_ISSUER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm sm:col-span-2">
          <span>Forma de cobrança</span>
          <select
            id="invoiced"
            className={PRIME_INPUT_CLASS}
            value={form.invoiced ? "sim" : "nao"}
            onChange={(e) => setForm((f) => ({ ...f, invoiced: e.target.value === "sim" }))}
            disabled={off}
          >
            <option value="sim">Faturado — as corridas entram na fatura do período</option>
            <option value="nao">Não faturado — o cliente paga antes do serviço</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Fechamento da fatura</span>
          <select
            id="invoice-closing-day"
            className={PRIME_INPUT_CLASS}
            value={form.invoice_closing_day}
            onChange={(e) => setForm((f) => ({ ...f, invoice_closing_day: e.target.value }))}
            disabled={off}
          >
            <option value="0">Mês cheio (dia 1 ao último dia)</option>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)}>
                Fecha todo dia {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2 self-end rounded-lg bg-prime-bg p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.invoice_auto_close}
            onChange={(e) => setForm((f) => ({ ...f, invoice_auto_close: e.target.checked }))}
            disabled={off}
          />
          <span>
            <span className="font-medium">Fechar automaticamente</span>
            <span className="block text-xs text-prime-muted">
              No dia seguinte ao fechamento o sistema soma as corridas e cria a fatura. Você só anexa o boleto e envia.
            </span>
          </span>
        </label>

        <p className="text-xs text-prime-muted sm:col-span-2">
          Exemplo com estes valores: 45 min de espera − {example.tolerance_minutes} de tolerância ={" "}
          {example.billable_minutes} min cobrados → cliente {fmtMoney(example.client_amount)}, parceiro{" "}
          {fmtMoney(example.driver_amount)}.
        </p>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={off}
            className="rounded-lg bg-prime-gold px-4 py-2 text-sm font-medium text-prime-text hover:bg-prime-gold-hover disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Salvar cobrança"}
          </button>
        </div>
      </form>
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-red-700" : "text-sm text-emerald-700"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
