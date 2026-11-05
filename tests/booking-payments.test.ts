import { test } from "node:test";
import assert from "node:assert/strict";
import { allocatePrepaid, summarizePackage } from "../src/lib/finance/booking-payments-core.ts";

const trips = [1, 2, 3, 4, 5].map((d) => ({ id: `t${d}`, scheduled_at: `2026-11-2${4 + d}T10:00:00Z`, client_amount: 1000 }));
const pay = (amount: number) => ({ id: "p" + amount, trip_ids: trips.map((t) => t.id), amount, method: "pix", account: null, installments: null, fee_amount: null, paid_on: "2026-11-05", notes: null });

test("50% de 5 diárias quita dias 1, 2 e metade do 3", () => {
  const a = allocatePrepaid(trips, [pay(2500)]);
  assert.equal(a.get("t1"), 1000);
  assert.equal(a.get("t2"), 1000);
  assert.equal(a.get("t3"), 500);
  assert.equal(a.get("t4"), undefined);
});

test("resumo: total, pago e saldo", () => {
  const s = summarizePackage(trips, [pay(2500), pay(500)]);
  assert.equal(s.total, 5000);
  assert.equal(s.paid, 3000);
  assert.equal(s.balance, 2000);
});
