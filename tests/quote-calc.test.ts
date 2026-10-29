import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveQuoteStatus, itemsMissingForTrips, quoteTotals } from "../src/lib/quotes/quote-calc.ts";

test("totais com quantidade e desconto", () => {
  const t = quoteTotals(
    [
      { quantity: 2, unit_price: 250, driver_amount: 150 },
      { quantity: 1, unit_price: 850.5, driver_amount: 550 }
    ],
    50
  );
  assert.equal(t.subtotal, 1350.5);
  assert.equal(t.total, 1300.5);
  assert.equal(t.cost, 850);
  assert.equal(t.margin, 450.5);
  assert.equal(t.trips, 3);
});

test("desconto não passa do subtotal", () => {
  assert.equal(quoteTotals([{ quantity: 1, unit_price: 100 }], 500).total, 0);
});

test("vencido e itens incompletos", () => {
  assert.equal(effectiveQuoteStatus("enviado", "2026-10-01", "2026-10-29"), "expirado");
  assert.equal(effectiveQuoteStatus("aprovado", "2026-10-01", "2026-10-29"), "aprovado");
  assert.deepEqual(itemsMissingForTrips([{ quantity: 1, unit_price: 1, scheduled_at: "x", origin_text: "Aeroporto", destination_text: "" }]), [
    { index: 0, missing: ["destino"] }
  ]);
});

import { tripAmountsFromQuote } from "../src/lib/quotes/quote-calc.ts";
test("desconto repartido entre as corridas fecha no total", () => {
  const a = tripAmountsFromQuote([{ quantity: 3, unit_price: 100 }], 10);
  assert.equal(a.reduce((s, n) => s + n, 0), 290);
  assert.equal(a.length, 3);
  assert.deepEqual(tripAmountsFromQuote([{ quantity: 2, unit_price: 50 }], 0), [50, 50]);
});
