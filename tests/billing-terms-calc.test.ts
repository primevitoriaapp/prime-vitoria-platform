import test from "node:test";
import assert from "node:assert/strict";
import { calculateWaitCharge, receivableDueDate } from "../src/lib/clients/billing-terms-calc.ts";

test("hora parada: 45 min com 15 de tolerância cobra 30 min proporcionais", () => {
  const r = calculateWaitCharge(45, {
    wait_tolerance_minutes: 15,
    wait_client_price_per_hour: 60,
    wait_driver_price_per_hour: 40
  });
  assert.equal(r.billable_minutes, 30);
  assert.equal(r.client_amount, 30);
  assert.equal(r.driver_amount, 20);
});

test("hora parada: dentro da tolerância não cobra", () => {
  const r = calculateWaitCharge(15, {
    wait_tolerance_minutes: 15,
    wait_client_price_per_hour: 45,
    wait_driver_price_per_hour: 30
  });
  assert.equal(r.billable_minutes, 0);
  assert.equal(r.client_amount, 0);
  assert.equal(r.driver_amount, 0);
});

test("hora parada: sem valor cadastrado não cobra", () => {
  const r = calculateWaitCharge(90, {
    wait_tolerance_minutes: 15,
    wait_client_price_per_hour: null,
    wait_driver_price_per_hour: null
  });
  assert.equal(r.billable_minutes, 75);
  assert.equal(r.client_amount, 0);
});

test("hora parada: Cox Sport 45/h, espera de 35 min → 20 min = R$ 15,00", () => {
  const r = calculateWaitCharge(35, {
    wait_tolerance_minutes: 15,
    wait_client_price_per_hour: 45,
    wait_driver_price_per_hour: null
  });
  assert.equal(r.client_amount, 15);
});

test("vencimento usa o prazo do cliente e cai para 30 dias", () => {
  const base = new Date("2026-10-28T12:00:00Z");
  assert.equal(receivableDueDate(15, base), "2026-11-12");
  assert.equal(receivableDueDate(0, base), "2026-10-28");
  assert.equal(receivableDueDate(null, base), "2026-11-27");
});
