export type ClosingLine = {
  entity_type: string;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  status?: string;
};

export type DreSummary = {
  period_start: string;
  period_end: string;
  revenue_clients: number;
  cost_clients: number;
  margin_clients: number;
  payout_drivers: number;
  driver_cost_lines: number;
  net_margin: number;
  closing_rows: number;
  closed_rows: number;
  draft_rows: number;
};

export function summarizeClosingsToDre(
  periodStart: string,
  periodEnd: string,
  rows: ClosingLine[]
): DreSummary {
  let revenue_clients = 0;
  let cost_clients = 0;
  let margin_clients = 0;
  let payout_drivers = 0;
  let driver_cost_lines = 0;
  let closed_rows = 0;
  let draft_rows = 0;

  for (const row of rows) {
    const gross = Number(row.gross_amount) || 0;
    const cost = Number(row.cost_amount) || 0;
    const margin = Number(row.margin_amount) || 0;

    if (row.status === "closed") closed_rows += 1;
    if (row.status === "draft") draft_rows += 1;

    if (row.entity_type === "client") {
      revenue_clients += gross;
      cost_clients += cost;
      margin_clients += margin;
    } else if (row.entity_type === "driver") {
      payout_drivers += gross;
      driver_cost_lines += cost;
    }
  }

  return {
    period_start: periodStart,
    period_end: periodEnd,
    revenue_clients: roundMoney(revenue_clients),
    cost_clients: roundMoney(cost_clients),
    margin_clients: roundMoney(margin_clients),
    payout_drivers: roundMoney(payout_drivers),
    driver_cost_lines: roundMoney(driver_cost_lines),
    net_margin: roundMoney(margin_clients),
    closing_rows: rows.length,
    closed_rows,
    draft_rows
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
