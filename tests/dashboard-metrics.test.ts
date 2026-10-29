import { test } from "node:test";
import assert from "node:assert/strict";
import { dashRanges, pctChange, summarize, topBy } from "../src/lib/operations/dashboard-metrics.ts";

const now = new Date("2026-10-29T01:30:00Z");

test("faixas de período", () => {
  const h = dashRanges("hoje", now);
  assert.equal(h.from, "2026-10-28T03:00:00.000Z");
  assert.equal(h.to, "2026-10-29T03:00:00.000Z");
  assert.equal(h.prevFrom, "2026-10-27T03:00:00.000Z");
  const m = dashRanges("mes", now);
  assert.equal(m.from, "2026-10-01T03:00:00.000Z");
  assert.equal(m.to, "2026-11-01T03:00:00.000Z");
  assert.equal(m.prevFrom, "2026-09-01T03:00:00.000Z");
  const a = dashRanges("ano", now);
  assert.equal(a.from, "2026-01-01T03:00:00.000Z");
});

const trips = [
  { operational_status: "completed", client_amount: 250, driver_amount: 100, client_id: "a", driver_id: "x" },
  { operational_status: "completed", client_amount: 150, driver_amount: 90, client_id: "b", driver_id: "x" },
  { operational_status: "completed", client_amount: null, driver_amount: null, client_id: "a", driver_id: "y" },
  { operational_status: "cancelled", client_amount: 300, driver_amount: 0, client_id: "b", driver_id: null },
  { operational_status: "in_progress", client_amount: 0, driver_amount: 0, client_id: "a", driver_id: "y" }
];

test("resumo", () => {
  const s = summarize(trips);
  assert.equal(s.total, 5);
  assert.equal(s.completed, 3);
  assert.equal(s.cancelled, 1);
  assert.equal(s.active, 1);
  assert.equal(s.revenue, 400);
  assert.equal(s.payout, 190);
  assert.equal(s.profit, 210);
  assert.equal(s.completionRate, 60);
  assert.equal(s.completedNoValue, 1);
});

test("variação e ranking", () => {
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(5, 0), null);
  const top = topBy(trips, "client_id");
  assert.equal(top[0].id, "a");
  assert.equal(top[0].revenue, 250);
  assert.equal(top[0].trips, 3);
});
