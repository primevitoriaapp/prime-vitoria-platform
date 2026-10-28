/** Regras puras da fatura mensal do cliente (testáveis sem banco). */

export type InvoiceTripInput = {
  id: string;
  scheduled_at: string;
  client_amount: number | string | null;
  km_billable?: number | string | null;
  actual_km?: number | string | null;
  planned_km?: number | string | null;
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function tripKm(t: InvoiceTripInput): number {
  return num(t.km_billable) || num(t.actual_km) || num(t.planned_km);
}

export function summarizeInvoice(trips: InvoiceTripInput[]) {
  let total = 0;
  let km = 0;
  let withoutAmount = 0;
  for (const t of trips) {
    if (t.client_amount == null || t.client_amount === "") withoutAmount += 1;
    total += num(t.client_amount);
    km += tripKm(t);
  }
  return {
    trip_count: trips.length,
    total_amount: Math.round(total * 100) / 100,
    total_km: Math.round(km * 10) / 10,
    trips_without_amount: withoutAmount
  };
}

/** Mês anterior em Brasília: { start: "2026-09-01", end: "2026-09-30" }. */
export function previousMonthPeriod(now: Date = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  return monthPeriod(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
}

export function monthPeriod(year: number, month: number): { start: string; end: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Limites UTC de um período em datas de Brasília (início 00:00 e fim 23:59:59.999, UTC-3). */
export function periodUtcBounds(start: string, end: string): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(`${start}T00:00:00.000-03:00`).toISOString(),
    toIso: new Date(`${end}T23:59:59.999-03:00`).toISOString()
  };
}

/** Vencimento = fim do período + prazo do cliente (padrão 30 dias). */
export function invoiceDueDate(periodEnd: string, termDays: number | null | undefined): string {
  const days = termDays == null || !Number.isFinite(termDays) ? 30 : Math.max(0, Math.round(termDays));
  const d = new Date(`${periodEnd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  aberta: "Em aberto",
  enviada: "Enviada",
  paga: "Paga",
  cancelada: "Cancelada"
};

export function formatInvoiceNumber(n: number | string): string {
  return `FAT-${String(n).padStart(5, "0")}`;
}
