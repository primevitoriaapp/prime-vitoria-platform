import test from "node:test";
import assert from "node:assert/strict";
import { financialMarkPaidBodySchema, financialPaidAt } from "../src/lib/finance/mark-paid.ts";

test("financialMarkPaidBodySchema accepts paid_at with explicit offset", () => {
  const body = financialMarkPaidBodySchema.parse({
    payment_method: "pix",
    paid_at: "2026-05-18T10:00:00.000-03:00",
    reference: "comprovante-123"
  });
  assert.equal(body.paid_at, "2026-05-18T10:00:00.000-03:00");
});

test("financialMarkPaidBodySchema rejects ambiguous paid_at", () => {
  assert.throws(() =>
    financialMarkPaidBodySchema.parse({
      payment_method: "pix",
      paid_at: "2026-05-18T10:00:00"
    })
  );
  assert.throws(() =>
    financialMarkPaidBodySchema.parse({
      payment_method: "pix",
      paid_at: "2026-05-18"
    })
  );
});

test("financialPaidAt uses provided value or reference timestamp", () => {
  const reference = new Date("2026-05-18T13:00:00.000Z");
  assert.equal(financialPaidAt({ paid_at: "2026-05-18T10:00:00.000-03:00" }, reference), "2026-05-18T10:00:00.000-03:00");
  assert.equal(financialPaidAt({}, reference), "2026-05-18T13:00:00.000Z");
});
