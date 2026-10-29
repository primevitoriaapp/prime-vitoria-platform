/** Orçamentos: totais, situação e o que falta para virar corrida (funções puras). */

export type QuoteItemLike = {
  quantity: number;
  unit_price: number;
  driver_amount?: number | null;
  scheduled_at?: string | null;
  origin_text?: string | null;
  destination_text?: string | null;
  service_mode?: string | null;
  hours?: number | null;
};

/** Diária guardada como "diaria" + horas (o legado diaria_5h/10h/12h também conta). */
export function isDiaria(mode: string | null | undefined): boolean {
  return Boolean(mode && mode.startsWith("diaria"));
}

export function itemHours(mode: string | null | undefined, hours: number | null | undefined): number | null {
  if (hours != null && Number(hours) > 0) return Number(hours);
  const m = /^diaria_(\d+)h$/.exec(mode ?? "");
  return m ? Number(m[1]) : null;
}

/** Chave da tabela de preços do cliente para a diária (só existem 5, 10 e 12 h). */
export function priceKeyFor(mode: string, hours: number | null): string {
  if (!isDiaria(mode)) return mode;
  return hours === 5 || hours === 10 || hours === 12 ? `diaria_${hours}h` : "";
}

/** Serviço da corrida que nasce do orçamento (a agenda só conhece 5, 10 e 12 h). */
export function tripServiceModeFor(mode: string, hours: number | null): string {
  if (!isDiaria(mode)) return mode === "outro" ? "transfer" : mode;
  const h = hours ?? 12;
  return h <= 5 ? "diaria_5h" : h <= 10 ? "diaria_10h" : "diaria_12h";
}

/** Texto do serviço como o cliente lê no orçamento. */
export function serviceLabelForClient(mode: string | null | undefined, hours: number | null | undefined): string {
  if (isDiaria(mode)) {
    const h = itemHours(mode, hours);
    return h ? `Diária ${String(h).replace(".", ",")}h à disposição` : "Diária à disposição";
  }
  if (mode === "km") return "Corporativo por km";
  if (mode === "outro") return "";
  return "Transfer";
}

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
    if (!i.origin_text || i.origin_text.trim().length < 3) missing.push(isDiaria(i.service_mode) ? "local de início" : "embarque");
    const needsDest = !isDiaria(i.service_mode) && i.service_mode !== "outro";
    if (needsDest && (!i.destination_text || i.destination_text.trim().length < 3)) missing.push("destino");
    if (isDiaria(i.service_mode) && !itemHours(i.service_mode, i.hours)) missing.push("quantas horas");
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
