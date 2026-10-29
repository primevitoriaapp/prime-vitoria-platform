import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingGroupOf, bookingPeriodRange, brToday } from "../src/lib/operations/booking-periods.ts";

const now = new Date("2026-10-29T01:30:00Z"); // 28/10 22:30 em Brasília

test("hoje usa a data de Brasília", () => {
  assert.equal(brToday(now), "2026-10-28");
  const r = bookingPeriodRange("hoje", now);
  assert.equal(r.from, "2026-10-28T03:00:00.000Z");
  assert.equal(r.to, "2026-10-29T02:59:59.999Z");
});

test("ontem, amanhã e mês", () => {
  assert.equal(bookingPeriodRange("ontem", now).from, "2026-10-27T03:00:00.000Z");
  assert.equal(bookingPeriodRange("amanha", now).from, "2026-10-29T03:00:00.000Z");
  const m = bookingPeriodRange("mes", now);
  assert.equal(m.from, "2026-10-01T03:00:00.000Z");
  assert.equal(m.to, "2026-11-01T02:59:59.999Z");
});

test("grupos de status", () => {
  assert.equal(bookingGroupOf("requested"), "agendada");
  assert.equal(bookingGroupOf("accepted"), "atribuida");
  assert.equal(bookingGroupOf("arrived"), "em_rota");
  assert.equal(bookingGroupOf("completed"), "finalizada");
  assert.equal(bookingGroupOf("no_show"), "cancelada");
});
