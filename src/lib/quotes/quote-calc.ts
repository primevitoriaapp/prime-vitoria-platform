/** Orçamentos: totais, situação e o que falta para virar corrida (funções puras). */

export type QuoteItemLike = {
  quantity: number;
  unit_price: number;
  driver_amount?: number | null;
  scheduled_at?: string | null;
  origin_text?: string | null;
  destination_text?: string | null;
  service_mode?: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function quoteTotals(items: QuoteItemLike[], discount = 0) {
  const subtotal = r2(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0));
  const cost = r2(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.driver_amount) || 0), 0));
  const d = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = r2(subtotal - d);
  return { subtotal, discount: r2(d), total, cost, margin: r2(total - cost), trips: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0) };
}

export const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-gray-100 text-gray-700" },
  enviado: { label: "Enviado ao cliente", cls: "bg-blue-50 text-blue-800" },
  aprovado: { label: "Aprovado", cls: "bg-emerald-100 text-emerald-800" },
  recusado: { label: "Recusado", cls: "bg-red-50 text-red-700" },
  expirado: { label: "Vencido", cls: "bg-amber-100 text-amber-900" },
  cancelado: { label: "Cancelado", cls: "bg-gray-100 text-gray-500" }
};

/** Enviado e passou da validade = vencido (sem precisar de tarefa agendada). */
export function effectiveQuoteStatus(status: string, validUntil: string | null | undefined, today: string): string {
  if ((status === "enviado" || status === "rascunho") && validUntil && validUntil < today) return "expirado";
  return status;
}

/** Itens que ainda não têm o mínimo para virar corrida na agenda. */
export function itemsMissingForTrips(items: QuoteItemLike[]): { index: number; missing: string[] }[] {
  const out: { index: number; missing: string[] }[] = [];
  items.forEach((i, index) => {
    const missing: string[] = [];
    if (!i.scheduled_at) missing.push("data e hora");
    if (!i.origin_text || i.origin_text.trim().length < 3) missing.push("embarque");
    if (!i.destination_text || i.destination_text.trim().length < 3) missing.push("destino");
    if (missing.length) out.push({ index, missing });
  });
  return out;
}

export function formatQuoteNumber(n: number | null | undefined): string {
  return `ORC-${String(n ?? 0).padStart(4, "0")}`;
}

/**
 * Valor de cada corrida que nasce do orçamento, já com o desconto repartido
 * proporcionalmente (a soma bate com o total do orçamento, centavo a centavo).
 */
export function tripAmountsFromQuote(items: QuoteItemLike[], discount = 0): number[] {
  const units: number[] = [];
  for (const i of items) for (let k = 0; k < (Number(i.quantity) || 0); k++) units.push(Number(i.unit_price) || 0);
  const { subtotal, total } = quoteTotals(items, discount);
  if (subtotal <= 0 || total === subtotal) return units.map(r2);
  const factor = total / subtotal;
  const out = units.map((u) => r2(u * factor));
  const diff = r2(total - out.reduce((s, n) => s + n, 0));
  if (out.length) out[out.length - 1] = r2(out[out.length - 1] + diff);
  return out;
}
