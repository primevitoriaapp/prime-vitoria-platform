import test from "node:test";
import assert from "node:assert/strict";
import { closingFinancialAmount } from "../src/lib/finance/closing-amount.ts";

/** Espelha agregação de cliente/motorista (sem I/O). */
function aggregateSample(
  trips: Array<{
    client_id: string;
    driver_id: string | null;
    tf: { amount_client: number; amount_driver: number; tolls: number; parking: number; net_margin: number };
  }>
) {
  let clientGross = 0;
  let clientMargin = 0;
  let driverGross = 0;

  for (const t of trips) {
    clientGross += t.tf.amount_client;
    clientMargin += t.tf.net_margin;
    if (t.driver_id) driverGross += t.tf.amount_driver;
  }

  return { clientGross, clientMargin, driverGross };
}

test("closing aggregates sum trip financials", () => {
  const r = aggregateSample([
    {
      client_id: "c1",
      driver_id: "d1",
      tf: { amount_client: 100, amount_driver: 60, tolls: 5, parking: 0, net_margin: 35 }
    },
    {
      client_id: "c1",
      driver_id: "d1",
      tf: { amount_client: 50, amount_driver: 30, tolls: 0, parking: 2, net_margin: 18 }
    }
  ]);
  assert.equal(r.clientGross, 150);
  assert.equal(r.clientMargin, 53);
  assert.equal(r.driverGross, 90);
});

test("closingFinancialAmount treats non-finite values as zero", () => {
  assert.equal(closingFinancialAmount(10.5), 10.5);
  assert.equal(closingFinancialAmount("7.25"), 7.25);
  assert.equal(closingFinancialAmount(null), 0);
  assert.equal(closingFinancialAmount(Number.NaN), 0);
  assert.equal(closingFinancialAmount(Number.POSITIVE_INFINITY), 0);
});
