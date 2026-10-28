/** Regras puras de hora parada e prazo (sem acesso a banco). */

export type BillingIssuer = "rj_prime" | "prime_servicos" | "ilha_prime";

export const BILLING_ISSUER_OPTIONS: ReadonlyArray<{ id: BillingIssuer; label: string }> = [
  { id: "rj_prime", label: "R J Prime Transporte" },
  { id: "prime_servicos", label: "Prime Locadora & Serviços" },
  { id: "ilha_prime", label: "Ilha Prime Fretamento e Turismo" }
];

export type ClientBillingTerms = {
  wait_tolerance_minutes: number;
  wait_client_price_per_hour: number | null;
  wait_driver_price_per_hour: number | null;
  payment_term_days: number | null;
  billing_issuer: BillingIssuer | null;
};

export const DEFAULT_WAIT_TOLERANCE_MINUTES = 15;

export function emptyClientBillingTerms(): ClientBillingTerms {
  return {
    wait_tolerance_minutes: DEFAULT_WAIT_TOLERANCE_MINUTES,
    wait_client_price_per_hour: null,
    wait_driver_price_per_hour: null,
    payment_term_days: 30,
    billing_issuer: null
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type WaitCharge = {
  wait_minutes: number;
  tolerance_minutes: number;
  billable_minutes: number;
  client_amount: number;
  driver_amount: number;
};

/**
 * Hora parada: passados os minutos de tolerância, cobra só o que excede,
 * proporcional ao tempo (30 min = meia hora).
 */
export function calculateWaitCharge(
  waitMinutes: number | null | undefined,
  terms: Pick<ClientBillingTerms, "wait_tolerance_minutes" | "wait_client_price_per_hour" | "wait_driver_price_per_hour">
): WaitCharge {
  const wait = Math.max(0, Math.round(Number(waitMinutes) || 0));
  const tolerance = Math.max(0, Math.round(Number(terms.wait_tolerance_minutes ?? DEFAULT_WAIT_TOLERANCE_MINUTES)));
  const billable = Math.max(0, wait - tolerance);
  const hours = billable / 60;
  const clientRate = Number(terms.wait_client_price_per_hour) || 0;
  const driverRate = Number(terms.wait_driver_price_per_hour) || 0;
  return {
    wait_minutes: wait,
    tolerance_minutes: tolerance,
    billable_minutes: billable,
    client_amount: roundMoney(hours * clientRate),
    driver_amount: roundMoney(hours * driverRate)
  };
}

/** Vencimento da conta a receber a partir do prazo do cliente (padrão 30 dias). */
export function receivableDueDate(paymentTermDays: number | null | undefined, from: Date = new Date()): string {
  const days =
    paymentTermDays != null && Number.isFinite(Number(paymentTermDays)) && Number(paymentTermDays) >= 0
      ? Math.round(Number(paymentTermDays))
      : 30;
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
