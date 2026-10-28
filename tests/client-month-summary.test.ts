import test from "node:test";
import assert from "node:assert/strict";
import { saoPauloMonthKey, summarizeClientMonth } from "../src/lib/client/client-month-summary.ts";

test("summarizeClientMonth soma corridas, KM e valor do mês", () => {
  const trips = [
    { operational_status: "completed", scheduled_at: "2026-10-05T12:00:00Z", client_amount: "120.50", km_billable: 30, actual_km: 32 },
    { operational_status: "completed", scheduled_at: "2026-10-06T12:00:00Z", client_amount: null, planned_km: 12 },
    { operational_status: "requested", scheduled_at: "2026-10-29T19:00:00Z", client_amount: null },
    { operational_status: "cancelled", scheduled_at: "2026-10-02T12:00:00Z", client_amount: null },
    { operational_status: "completed", scheduled_at: "2026-11-01T02:00:00Z", client_amount: 50 }
  ];
  const s = summarizeClientMonth(trips, "2026-10");
  assert.equal(s.completed, 3);
  assert.equal(s.upcoming, 1);
  assert.equal(s.cancelled, 1);
  assert.equal(s.km, 42);
  assert.equal(s.amount_completed, 170.5);
  assert.equal(s.completed_without_amount, 1);
  assert.equal(saoPauloMonthKey("2026-11-01T02:00:00Z"), "2026-10");
});
