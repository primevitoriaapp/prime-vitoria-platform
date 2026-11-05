/**
 * Quando o cliente paga e quando o motorista recebe (regra de Rubens, 03/11/2026):
 * fechamento da fatura + prazo do cliente = vencimento; + dias úteis de conciliação bancária = pagamento ao motorista,
 * sempre em dia útil (fim de semana e feriado bancário passam para o próximo dia útil).
 * Datas em "AAAA-MM-DD" (dia de São Paulo). Sem dependências: testável.
 */

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parse(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}
function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

/** Domingo de Páscoa (algoritmo de Meeus/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const cache = new Map<number, Set<string>>();

/** Feriados em que os bancos não abrem (nacionais + Carnaval + Sexta-feira Santa + Corpus Christi). */
export function bankHolidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const easter = easterSunday(year);
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${year}-${md}`);
  const moving = [addDays(easter, -48), addDays(easter, -47), addDays(easter, -2), addDays(easter, 60)];
  const set = new Set([...fixed, ...moving]);
  cache.set(year, set);
  return set;
}

export function isBusinessDay(day: string): boolean {
  const d = parse(day);
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !bankHolidays(d.getUTCFullYear()).has(day);
}

/** O próprio dia se for útil; senão o próximo dia útil. */
export function nextBusinessDay(day: string): string {
  let cur = day;
  for (let i = 0; i < 15 && !isBusinessDay(cur); i++) cur = addDays(cur, 1);
  return cur;
}

export function addBusinessDays(day: string, n: number): string {
  let cur = day;
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur)) left--;
  }
  return cur;
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Dia em que a fatura que contém esta corrida fecha. closingDay 0 = mês cheio (último dia do mês). */
export function invoiceClosingDate(tripDay: string, closingDay: number | null | undefined): string {
  const d = parse(tripDay);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const cd = Math.round(Number(closingDay ?? 0));
  if (!cd || cd < 1) return `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDayOfMonth(y, m)).padStart(2, "0")}`;
  if (d.getUTCDate() <= cd) return `${y}-${String(m + 1).padStart(2, "0")}-${String(cd).padStart(2, "0")}`;
  const next = new Date(Date.UTC(y, m + 1, cd));
  return ymd(next);
}

export type ClientPaymentTerms = {
  /** false = cliente paga antes do serviço (não entra em fatura). */
  invoiced?: boolean | null;
  invoice_closing_day?: number | null;
  /** Fecha cada serviço (voucher/NR) separado: o boleto sai no dia seguinte ao serviço (ex.: CEP). */
  invoice_per_service?: boolean | null;
  /** Dias para pagar depois do fechamento (sem cadastro: 30). */
  payment_term_days?: number | null;
  /** Dias úteis até o dinheiro aparecer conciliado no banco (PIX: 0; boleto: ~2). */
  reconciliation_business_days?: number | null;
};

/** Vencimento previsto do que o cliente deve por esta corrida. */
export function clientDueDate(tripDay: string, terms: ClientPaymentTerms): string {
  if (terms.invoiced === false) return tripDay;
  const term = terms.payment_term_days == null || !Number.isFinite(Number(terms.payment_term_days)) ? 30 : Math.max(0, Math.round(Number(terms.payment_term_days)));
  if (terms.invoice_per_service) return addDays(addDays(tripDay, 1), term);
  return addDays(invoiceClosingDate(tripDay, terms.invoice_closing_day), term);
}

/** Data prevista para pagar o motorista parceiro, a partir do vencimento do cliente. */
export function driverPayoutDateFromClientDue(clientDue: string, reconciliationBusinessDays: number | null | undefined): string {
  return nextBusinessDay(addBusinessDays(clientDue, Number(reconciliationBusinessDays ?? 0) || 0));
}

export function driverPayoutDate(tripDay: string, terms: ClientPaymentTerms): string {
  return driverPayoutDateFromClientDue(clientDueDate(tripDay, terms), terms.reconciliation_business_days);
}

/** Dia (São Paulo) de um instante ISO. */
export function spDay(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    typeof iso === "string" ? new Date(iso) : iso
  );
}
