import { test } from "node:test";
import assert from "node:assert/strict";
import { nextMonthlyDue, payableSituation } from "../src/lib/finance/company-payables-calc.ts";

test("situação da conta", () => {
  const t = "2026-10-29";
  assert.equal(payableSituation({ status: "aberta", due_date: "2026-10-28" }, t), "vencida");
  assert.equal(payableSituation({ status: "aberta", due_date: "2026-10-29" }, t), "vence_hoje");
  assert.equal(payableSituation({ status: "aberta", due_date: "2026-11-02" }, t), "vence_breve");
  assert.equal(payableSituation({ status: "aberta", due_date: "2026-11-20" }, t), "em_dia");
  assert.equal(payableSituation({ status: "paga", due_date: "2026-10-01" }, t), "paga");
});

test("próximo vencimento mensal", () => {
  assert.equal(nextMonthlyDue("2026-10-10"), "2026-11-10");
  assert.equal(nextMonthlyDue("2026-01-31"), "2026-02-28");
  assert.equal(nextMonthlyDue("2026-12-15"), "2027-01-15");
});
