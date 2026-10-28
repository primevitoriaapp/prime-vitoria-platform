import test from "node:test";
import assert from "node:assert/strict";
import {
  formatInvoiceNumber,
  invoiceDueDate,
  monthPeriod,
  periodUtcBounds,
  previousMonthPeriod,
  summarizeInvoice
} from "../src/lib/finance/client-invoice-calc.ts";

test("summarizeInvoice soma valor e KM", () => {
  const s = summarizeInvoice([
    { id: "a", scheduled_at: "x", client_amount: "100.50", km_billable: 20 },
    { id: "b", scheduled_at: "x", client_amount: 49.5, actual_km: 12.34 },
    { id: "c", scheduled_at: "x", client_amount: null, planned_km: 5 }
  ]);
  assert.deepEqual(s, { trip_count: 3, total_amount: 150, total_km: 37.3, trips_without_amount: 1 });
});

test("períodos e vencimento", () => {
  assert.deepEqual(monthPeriod(2026, 2), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(previousMonthPeriod(new Date("2026-11-01T05:00:00Z")), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(previousMonthPeriod(new Date("2027-01-10T12:00:00Z")), { start: "2026-12-01", end: "2026-12-31" });
  assert.equal(invoiceDueDate("2026-10-31", 30), "2026-11-30");
  assert.equal(invoiceDueDate("2026-10-31", null), "2026-11-30");
  assert.equal(invoiceDueDate("2026-10-31", 0), "2026-10-31");
  assert.deepEqual(periodUtcBounds("2026-10-01", "2026-10-31"), {
    fromIso: "2026-10-01T03:00:00.000Z",
    toIso: "2026-11-01T02:59:59.999Z"
  });
  assert.equal(formatInvoiceNumber(7), "FAT-00007");
});
