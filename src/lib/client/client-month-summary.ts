export type SummaryTrip = {
  operational_status: string;
  scheduled_at: string;
  client_amount: number | string | null;
  km_billable?: number | string | null;
  actual_km?: number | string | null;
  planned_km?: number | string | null;
};

export type ClientMonthSummary = {
  month: string;
  completed: number;
  upcoming: number;
  cancelled: number;
  km: number;
  amount_completed: number;
  /** Corridas concluídas ainda sem valor fechado pela central. */
  completed_without_amount: number;
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Mês "AAAA-MM" de uma data em Brasília. */
export function saoPauloMonthKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${y}-${m}`;
}

/** Resumo do mês para o gestor da conta: corridas, KM rodado e valor até agora. */
export function summarizeClientMonth(trips: SummaryTrip[], month: string): ClientMonthSummary {
  const out: ClientMonthSummary = {
    month,
    completed: 0,
    upcoming: 0,
    cancelled: 0,
    km: 0,
    amount_completed: 0,
    completed_without_amount: 0
  };
  for (const t of trips) {
    if (saoPauloMonthKey(t.scheduled_at) !== month) continue;
    if (t.operational_status === "completed") {
      out.completed += 1;
      out.km += num(t.km_billable) || num(t.actual_km) || num(t.planned_km);
      if (t.client_amount == null || t.client_amount === "") out.completed_without_amount += 1;
      else out.amount_completed += num(t.client_amount);
    } else if (["cancelled", "rejected", "no_show"].includes(t.operational_status)) {
      out.cancelled += 1;
    } else {
      out.upcoming += 1;
    }
  }
  out.km = Math.round(out.km * 10) / 10;
  out.amount_completed = Math.round(out.amount_completed * 100) / 100;
  return out;
}
