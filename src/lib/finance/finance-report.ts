/** Painel financeiro: DRE, fluxo de caixa, previsão e inadimplência (funções puras). */

const r2 = (n: number) => Math.round(n * 100) / 100;

export type FinTrip = { id: string; client_id: string; issuer: string | null; completed_on: string; client_amount: number; driver_amount: number; invoiced: boolean };
export type FinInvoice = { id: string; client_id: string; issuer: string | null; issue_date: string; due_date: string; total: number; status: string; paid_on: string | null };
export type FinReceivable = { id: string; client_id: string; issuer: string | null; due_date: string; amount: number; status: string; paid_on: string | null; invoiced: boolean };
export type FinPayable = { id: string; issuer: string | null; category: string; due_date: string; amount: number; status: string; paid_on: string | null; paid_amount: number | null };
export type FinDriverPayable = { id: string; due_date: string | null; amount: number; status: string; paid_on: string | null };
export type FinOtherIncome = { id: string; due_date: string; amount: number; status: string; received_on: string | null; received_amount: number | null; category: string };

export type FinInput = {
  from: string;
  to: string;
  today: string;
  trips: FinTrip[];
  invoices: FinInvoice[];
  receivables: FinReceivable[];
  payables: FinPayable[];
  driverPayables: FinDriverPayable[];
  otherIncomes?: FinOtherIncome[];
  clientNames: Record<string, string>;
};

const inRange = (d: string | null | undefined, from: string, to: string) => Boolean(d) && (d as string) >= from && (d as string) <= to;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const daysLate = (due: string, today: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86400000);

export function buildFinanceReport(input: FinInput) {
  const { from, to, today } = input;

  // DRE por competência (o que foi feito no período).
  const periodTrips = input.trips.filter((t) => inRange(t.completed_on, from, to));
  const tripRevenue = r2(periodTrips.reduce((s, t) => s + t.client_amount, 0));
  const others = (input.otherIncomes ?? []).filter((o) => o.status !== "cancelada");
  const otherRevenue = r2(others.filter((o) => inRange(o.due_date, from, to)).reduce((s, o) => s + (o.status === "recebida" ? (o.received_amount ?? o.amount) : o.amount), 0));
  const grossRevenue = r2(tripRevenue + otherRevenue);
  const driverCost = r2(periodTrips.reduce((s, t) => s + t.driver_amount, 0));
  const contribution = r2(grossRevenue - driverCost);
  const expenseRows = input.payables.filter((p) => p.status !== "cancelada" && inRange(p.due_date, from, to));
  const byCategory = new Map<string, number>();
  for (const p of expenseRows) byCategory.set(p.category, r2((byCategory.get(p.category) ?? 0) + (p.status === "paga" ? (p.paid_amount ?? p.amount) : p.amount)));
  const expenses = r2([...byCategory.values()].reduce((s, n) => s + n, 0));
  const taxes = r2(byCategory.get("impostos") ?? 0);
  const result = r2(contribution - expenses);

  // Caixa realizado no período (o que entrou e saiu de verdade).
  const received = r2(
    input.invoices.filter((i) => i.status === "paga" && inRange(i.paid_on, from, to)).reduce((s, i) => s + i.total, 0) +
      input.receivables.filter((r) => !r.invoiced && r.status === "paid" && inRange(r.paid_on, from, to)).reduce((s, r) => s + r.amount, 0) +
      others.filter((o) => o.status === "recebida" && inRange(o.received_on, from, to)).reduce((s, o) => s + (o.received_amount ?? o.amount), 0)
  );
  const paidExpenses = r2(input.payables.filter((p) => p.status === "paga" && inRange(p.paid_on, from, to)).reduce((s, p) => s + (p.paid_amount ?? p.amount), 0));
  const paidDrivers = r2(input.driverPayables.filter((d) => d.status === "paid" && inRange(d.paid_on, from, to)).reduce((s, d) => s + d.amount, 0));
  const cashResult = r2(received - paidExpenses - paidDrivers);

  // Em aberto: a receber (faturas abertas + corridas ainda fora de fatura) e a pagar.
  const openIn = [
    ...input.invoices.filter((i) => i.status === "aberta" || i.status === "enviada").map((i) => ({ due: i.due_date, amount: i.total, client: i.client_id })),
    ...input.receivables.filter((r) => r.status === "open" && !r.invoiced).map((r) => ({ due: r.due_date, amount: r.amount, client: r.client_id })),
    ...others.filter((o) => o.status === "aberta").map((o) => ({ due: o.due_date, amount: o.amount, client: "" }))
  ];
  const openOut = [
    ...input.payables.filter((p) => p.status === "aberta").map((p) => ({ due: p.due_date, amount: p.amount })),
    ...input.driverPayables.filter((d) => d.status === "open").map((d) => ({ due: d.due_date ?? today, amount: d.amount }))
  ];
  const sumWhere = <T extends { due: string; amount: number }>(xs: T[], f: (x: T) => boolean) => r2(xs.filter(f).reduce((s, x) => s + x.amount, 0));
  const forecast = [30, 60, 90].map((days) => {
    const limit = addDays(today, days);
    const inn = sumWhere(openIn, (x) => x.due <= limit);
    const out = sumWhere(openOut, (x) => x.due <= limit);
    return { days, receive: inn, pay: out, balance: r2(inn - out) };
  });

  // Inadimplência por faixa de atraso.
  const overdue = openIn.filter((x) => x.due < today);
  const aging = [
    { label: "1 a 30 dias", min: 1, max: 30 },
    { label: "31 a 60 dias", min: 31, max: 60 },
    { label: "61 a 90 dias", min: 61, max: 90 },
    { label: "Mais de 90 dias", min: 91, max: Infinity }
  ].map((b) => ({
    label: b.label,
    amount: sumWhere(overdue, (x) => {
      const d = daysLate(x.due, today);
      return d >= b.min && d <= b.max;
    }),
    count: overdue.filter((x) => {
      const d = daysLate(x.due, today);
      return d >= b.min && d <= b.max;
    }).length
  }));
  const totalOpenIn = r2(openIn.reduce((s, x) => s + x.amount, 0));
  const overdueTotal = r2(overdue.reduce((s, x) => s + x.amount, 0));

  // Por cliente (competência).
  const perClient = new Map<string, { revenue: number; cost: number; trips: number }>();
  for (const t of periodTrips) {
    const row = perClient.get(t.client_id) ?? { revenue: 0, cost: 0, trips: 0 };
    row.revenue += t.client_amount;
    row.cost += t.driver_amount;
    row.trips += 1;
    perClient.set(t.client_id, row);
  }
  const clients = [...perClient.entries()]
    .map(([id, v]) => ({
      id,
      name: input.clientNames[id] ?? "Cliente",
      trips: v.trips,
      revenue: r2(v.revenue),
      cost: r2(v.cost),
      margin: r2(v.revenue - v.cost),
      marginPct: v.revenue > 0 ? Math.round(((v.revenue - v.cost) / v.revenue) * 100) : 0,
      share: grossRevenue > 0 ? Math.round((v.revenue / grossRevenue) * 100) : 0,
      overdue: r2(overdue.filter((x) => x.client === id).reduce((s, x) => s + x.amount, 0))
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    dre: {
      grossRevenue,
      tripRevenue,
      otherRevenue,
      driverCost,
      contribution,
      contributionPct: grossRevenue > 0 ? Math.round((contribution / grossRevenue) * 100) : 0,
      expenses,
      taxes,
      expensesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
      result,
      resultPct: grossRevenue > 0 ? Math.round((result / grossRevenue) * 100) : 0,
      trips: periodTrips.length,
      avgTicket: periodTrips.length ? r2(grossRevenue / periodTrips.length) : 0
    },
    cash: { received, paidExpenses, paidDrivers, result: cashResult },
    open: { receive: totalOpenIn, pay: r2(openOut.reduce((s, x) => s + x.amount, 0)), overdue: overdueTotal, defaultRate: totalOpenIn > 0 ? Math.round((overdueTotal / totalOpenIn) * 100) : 0 },
    forecast,
    aging,
    clients,
    concentration: clients[0] ? { name: clients[0].name, share: clients[0].share } : null
  };
}

export type MonthPoint = { month: string; revenue: number; driverCost: number; expenses: number; result: number; trips: number };

/** Evolução mês a mês (competência): faturamento, custo de motoristas, despesas e resultado. */
export function monthlySeries(
  months: string[],
  trips: Pick<FinTrip, "completed_on" | "client_amount" | "driver_amount">[],
  payables: Pick<FinPayable, "due_date" | "amount" | "status" | "paid_amount">[],
  otherIncomes: Pick<FinOtherIncome, "due_date" | "amount" | "status" | "received_amount">[] = []
): MonthPoint[] {
  return months.map((m) => {
    const t = trips.filter((x) => x.completed_on.startsWith(m));
    const rev = t.reduce((s, x) => s + x.client_amount, 0) + otherIncomes.filter((o) => o.status !== "cancelada" && o.due_date.startsWith(m)).reduce((s, o) => s + (o.status === "recebida" ? (o.received_amount ?? o.amount) : o.amount), 0);
    const cost = t.reduce((s, x) => s + x.driver_amount, 0);
    const exp = payables.filter((p) => p.status !== "cancelada" && p.due_date.startsWith(m)).reduce((s, p) => s + (p.status === "paga" ? (p.paid_amount ?? p.amount) : p.amount), 0);
    return { month: m, revenue: r2(rev), driverCost: r2(cost), expenses: r2(exp), result: r2(rev - cost - exp), trips: t.length };
  });
}

export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return out;
}
