/** Pagamento antecipado (sinal / na reserva). Regras puras, sem banco. */

export const BOOKING_PAYMENT_METHODS = {
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  link_pagamento: "Link de pagamento",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  outro: "Outro"
} as const;
export type BookingPaymentMethod = keyof typeof BOOKING_PAYMENT_METHODS;

/** Sugestões para "onde caiu o dinheiro". */
export const BOOKING_PAYMENT_ACCOUNTS = ["Conta Sicoob (PIX)", "InfinitePay (link / maquininha)", "Dinheiro com motorista", "Outra conta"];

export type BookingPayment = {
  id: string;
  trip_ids: string[];
  amount: number;
  method: string;
  account: string | null;
  installments: number | null;
  fee_amount: number | null;
  paid_on: string;
  notes: string | null;
};
export type PackageTrip = { id: string; scheduled_at: string; client_amount: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Distribui o que já foi pago entre as corridas do pacote, na ordem das datas
 * (ex.: 50% de 5 diárias quita os dias 1 e 2 e metade do dia 3).
 */
export function allocatePrepaid(trips: PackageTrip[], payments: BookingPayment[]): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = [...trips].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  // Agrupa por pacote (mesmo conjunto de corridas).
  const groups = new Map<string, { ids: Set<string>; paid: number }>();
  for (const p of payments) {
    const key = [...p.trip_ids].sort().join(",");
    const g = groups.get(key) ?? { ids: new Set(p.trip_ids), paid: 0 };
    g.paid = r2(g.paid + Number(p.amount || 0));
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    let left = g.paid;
    for (const t of ordered) {
      if (!g.ids.has(t.id) || left <= 0) continue;
      const due = Math.max(0, Number(t.client_amount ?? 0) - (out.get(t.id) ?? 0));
      const take = r2(Math.min(due, left));
      if (take > 0) {
        out.set(t.id, r2((out.get(t.id) ?? 0) + take));
        left = r2(left - take);
      }
    }
  }
  return out;
}

export type PackageSummary = {
  trip_count: number;
  total: number;
  /** Corridas ainda sem valor definido (total pode subir). */
  missing_amount: number;
  paid: number;
  balance: number;
  payments: BookingPayment[];
};

export function summarizePackage(trips: PackageTrip[], payments: BookingPayment[]): PackageSummary {
  const total = r2(trips.reduce((s, t) => s + Number(t.client_amount ?? 0), 0));
  const paid = r2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
  return {
    trip_count: trips.length,
    total,
    missing_amount: trips.filter((t) => t.client_amount == null).length,
    paid,
    balance: r2(Math.max(0, total - paid)),
    payments: [...payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on))
  };
}

export function paymentLabel(p: Pick<BookingPayment, "method" | "account" | "installments">): string {
  const m = BOOKING_PAYMENT_METHODS[p.method as BookingPaymentMethod] ?? p.method;
  return [m + (p.installments && p.installments > 1 ? ` em ${p.installments}x` : ""), p.account].filter(Boolean).join(" · ");
}
