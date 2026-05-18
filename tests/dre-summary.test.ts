import test from "node:test";
import assert from "node:assert/strict";
import { summarizeClosingsToDre } from "../src/lib/finance/dre-summary.ts";
import { parseDreSummaryQuery } from "../src/lib/finance/dre-summary-query.ts";
import { sumFinancialAmounts } from "../src/lib/finance/sum-financial-amounts.ts";

test("summarizeClosingsToDre aggregates client and driver lines", () => {
  const dre = summarizeClosingsToDre("2026-05-01", "2026-05-31", [
    {
      entity_type: "client",
      gross_amount: 1000,
      cost_amount: 700,
      margin_amount: 300,
      status: "closed"
    },
    {
      entity_type: "driver",
      gross_amount: 500,
      cost_amount: 20,
      margin_amount: 500,
      status: "draft"
    }
  ]);
  assert.equal(dre.revenue_clients, 1000);
  assert.equal(dre.margin_clients, 300);
  assert.equal(dre.payout_drivers, 500);
  assert.equal(dre.net_margin, 300);
  assert.equal(dre.closed_rows, 1);
  assert.equal(dre.draft_rows, 1);
});

test("summarizeClosingsToDre treats non-finite amounts as zero", () => {
  const dre = summarizeClosingsToDre("2026-05-01", "2026-05-31", [
    {
      entity_type: "client",
      gross_amount: Number.POSITIVE_INFINITY,
      cost_amount: Number.NaN,
      margin_amount: 25,
      status: "closed"
    },
    {
      entity_type: "driver",
      gross_amount: Number.NaN,
      cost_amount: Number.POSITIVE_INFINITY,
      margin_amount: 0,
      status: "draft"
    }
  ]);
  assert.equal(dre.revenue_clients, 0);
  assert.equal(dre.cost_clients, 0);
  assert.equal(dre.margin_clients, 25);
  assert.equal(dre.payout_drivers, 0);
  assert.equal(dre.driver_cost_lines, 0);
});

test("sumFinancialAmounts ignores non-finite row amounts", () => {
  assert.equal(
    sumFinancialAmounts([
      { amount: 10 },
      { amount: "2.5" },
      { amount: Number.NaN },
      { amount: Number.POSITIVE_INFINITY },
      { amount: null }
    ]),
    12.5
  );
  assert.equal(sumFinancialAmounts(null), 0);
});

test("parseDreSummaryQuery validates real date-only period", () => {
  const q = parseDreSummaryQuery(
    new URLSearchParams("format=html&period_start=2026-05-01&period_end=2026-05-31")
  );
  assert.equal(q.format, "html");
  assert.equal(q.period_start, "2026-05-01");
  assert.equal(q.period_end, "2026-05-31");
  assert.throws(() => parseDreSummaryQuery(new URLSearchParams("period_start=2026-02-31&period_end=2026-03-01")));
  assert.throws(
    () => parseDreSummaryQuery(new URLSearchParams("period_start=2026-06-01&period_end=2026-05-31")),
    /period_end must be after/
  );
});
