import test from "node:test";
import assert from "node:assert/strict";
import {
  daysUntilDriverPayableDue,
  driverPayableDueDate,
  driverPayableForecast
} from "../src/lib/finance/driver-payable-forecast.ts";
import { driverPayableAmountFromFinancial } from "../src/lib/finance/driver-payable-amount.ts";

const reference = new Date("2026-05-16T15:00:00Z");

test("driverPayableDueDate returns D+30 in UTC date format", () => {
  assert.equal(driverPayableDueDate(reference), "2026-06-15");
});

test("daysUntilDriverPayableDue computes calendar days", () => {
  assert.equal(daysUntilDriverPayableDue("2026-06-15", reference), 30);
  assert.equal(daysUntilDriverPayableDue("2026-05-16", reference), 0);
  assert.equal(daysUntilDriverPayableDue("2026-05-15", reference), -1);
});

test("driverPayableForecast labels open and paid payables", () => {
  assert.deepEqual(driverPayableForecast({ due_date: "2026-06-15", status: "open" }, reference), {
    days_until_due: 30,
    overdue: false,
    due_label: "Previsto em D+30"
  });
  assert.equal(driverPayableForecast({ due_date: "2026-05-15", status: "open" }, reference).overdue, true);
  assert.equal(driverPayableForecast({ due_date: "2026-05-15", status: "paid" }, reference).due_label, "Pago");
  assert.equal(driverPayableForecast({ due_date: "2026-05-15", status: "cancelled" }, reference).due_label, "Cancelado");
  assert.equal(driverPayableForecast({ due_date: "2026-05-15", status: "cancelled" }, reference).overdue, false);
});

test("driverPayableAmountFromFinancial accepts only positive finite amounts", () => {
  assert.equal(driverPayableAmountFromFinancial(120), 120);
  assert.equal(driverPayableAmountFromFinancial("99.5"), 99.5);
  assert.equal(driverPayableAmountFromFinancial(0), null);
  assert.equal(driverPayableAmountFromFinancial(-1), null);
  assert.equal(driverPayableAmountFromFinancial(Number.NaN), null);
  assert.equal(driverPayableAmountFromFinancial(Number.POSITIVE_INFINITY), null);
});
