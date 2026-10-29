import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFinanceReport } from "../src/lib/finance/finance-report.ts";

const base = {
  from: "2026-10-01",
  to: "2026-10-31",
  today: "2026-10-29",
  clientNames: { a: "Comexport", b: "Cox" }
};

test("DRE, caixa, previsão e inadimplência", () => {
  const r = buildFinanceReport({
    ...base,
    trips: [
      { id: "t1", client_id: "a", issuer: null, completed_on: "2026-10-05", client_amount: 1000, driver_amount: 600, invoiced: true },
      { id: "t2", client_id: "b", issuer: null, completed_on: "2026-10-20", client_amount: 500, driver_amount: 300, invoiced: false },
      { id: "t3", client_id: "b", issuer: null, completed_on: "2026-09-20", client_amount: 999, driver_amount: 1, invoiced: false }
    ],
    invoices: [
      { id: "i1", client_id: "a", issuer: null, issue_date: "2026-10-01", due_date: "2026-10-10", total: 1000, status: "paga", paid_on: "2026-10-12" },
      { id: "i2", client_id: "a", issuer: null, issue_date: "2026-08-01", due_date: "2026-08-20", total: 400, status: "enviada", paid_on: null }
    ],
    receivables: [{ id: "r1", client_id: "b", issuer: null, due_date: "2026-11-15", amount: 500, status: "open", paid_on: null, invoiced: false }],
    payables: [
      { id: "p1", issuer: null, category: "seguro", due_date: "2026-10-15", amount: 200, status: "paga", paid_on: "2026-10-15", paid_amount: 210 },
      { id: "p2", issuer: null, category: "impostos", due_date: "2026-10-20", amount: 90, status: "aberta", paid_on: null, paid_amount: null },
      { id: "p3", issuer: null, category: "aluguel", due_date: "2026-12-30", amount: 1000, status: "aberta", paid_on: null, paid_amount: null }
    ],
    driverPayables: [{ id: "d1", due_date: "2026-11-05", amount: 300, status: "open", paid_on: null }]
  });
  assert.equal(r.dre.grossRevenue, 1500);
  assert.equal(r.dre.driverCost, 900);
  assert.equal(r.dre.contribution, 600);
  assert.equal(r.dre.expenses, 300); // 210 (paga) + 90
  assert.equal(r.dre.taxes, 90);
  assert.equal(r.dre.result, 300);
  assert.equal(r.cash.received, 1000);
  assert.equal(r.cash.paidExpenses, 210);
  assert.equal(r.open.receive, 900);
  assert.equal(r.open.overdue, 400);
  assert.equal(r.aging[2].amount, 400); // 70 dias de atraso
  assert.equal(r.forecast[0].receive, 900); // vencidas + até 28/11
  assert.equal(r.forecast[0].pay, 390); // 90 + 300
  assert.equal(r.clients[0].name, "Comexport");
  assert.equal(r.clients[0].share, 67);
});

import { lastMonths, monthlySeries } from "../src/lib/finance/finance-report.ts";
test("evolução mensal e receitas avulsas", () => {
  assert.deepEqual(lastMonths("2026-10-29", 3), ["2026-08", "2026-09", "2026-10"]);
  const s = monthlySeries(
    ["2026-09", "2026-10"],
    [{ completed_on: "2026-10-03", client_amount: 1000, driver_amount: 600 }],
    [{ due_date: "2026-10-10", amount: 100, status: "aberta", paid_amount: null }],
    [{ due_date: "2026-09-05", amount: 300, status: "recebida", received_amount: 280 }]
  );
  assert.deepEqual(s[0], { month: "2026-09", revenue: 280, driverCost: 0, expenses: 0, result: 280, trips: 0 });
  assert.equal(s[1].result, 300);
});
