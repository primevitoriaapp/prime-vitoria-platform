/** Classificação das contas a receber em aberto para o alerta do painel. */

export type ReceivableAlertRow = { id: string; client_name: string | null; amount: number; due_date: string };

export type ReceivableAlerts = {
  overdue: { count: number; total: number; items: ReceivableAlertRow[] };
  due_soon: { count: number; total: number; items: ReceivableAlertRow[] };
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** `today` em AAAA-MM-DD (fuso de Brasília). Vence em até `soonDays` dias = "vence em breve". */
export function classifyReceivables(rows: ReceivableAlertRow[], today: string, soonDays = 3): ReceivableAlerts {
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + soonDays);
  const soonLimit = limit.toISOString().slice(0, 10);

  const overdue = rows.filter((r) => r.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const dueSoon = rows
    .filter((r) => r.due_date >= today && r.due_date <= soonLimit)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const sum = (xs: ReceivableAlertRow[]) => roundMoney(xs.reduce((s, r) => s + Number(r.amount || 0), 0));
  return {
    overdue: { count: overdue.length, total: sum(overdue), items: overdue.slice(0, 10) },
    due_soon: { count: dueSoon.length, total: sum(dueSoon), items: dueSoon.slice(0, 10) }
  };
}

export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}
