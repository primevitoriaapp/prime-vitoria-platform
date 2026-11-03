import { test } from "node:test";
import assert from "node:assert/strict";
import { maskDate, maskTime, typedDateToYmd, typedTimeToHm } from "../src/lib/dates/typed-date.ts";

test("máscara de data", () => {
  assert.equal(maskDate("03"), "03");
  assert.equal(maskDate("031"), "03/1");
  assert.equal(maskDate("03112026"), "03/11/2026");
  assert.equal(maskDate("03/11/2026x"), "03/11/2026");
});

test("máscara de hora", () => {
  assert.equal(maskTime("0300"), "03:00");
  assert.equal(maskTime("15"), "15");
});

test("data digitada", () => {
  assert.equal(typedDateToYmd("03/11/2026", "2026-11-03"), "2026-11-03");
  assert.equal(typedDateToYmd("03/11/26", "2026-11-03"), "2026-11-03");
  assert.equal(typedDateToYmd("05/01", "2026-11-03"), "2027-01-05");
  assert.equal(typedDateToYmd("31/02/2026", "2026-11-03"), null);
});

test("hora digitada", () => {
  assert.equal(typedTimeToHm("03:00"), "03:00");
  assert.equal(typedTimeToHm("25:00"), null);
});
