import test from "node:test";
import assert from "node:assert/strict";
import { summarizeClosingsToDre } from "../src/lib/finance/dre-summary.ts";

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
