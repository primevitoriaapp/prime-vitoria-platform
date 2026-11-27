import test from "node:test";
import assert from "node:assert/strict";
import { billableKm, itemDates, itemOccurrences, kmAmount, quoteTotals, routineSummary, tripAmountsFromQuote, weekdaysLabel } from "../src/lib/quotes/quote-calc.ts";

const rotina = { quantity: 1, unit_price: 150, driver_amount: 100, service_date: "2026-12-01", repeat_weekdays: [1, 2, 3, 4, 5], repeat_until: "2026-12-31" };

test("rotina seg a sex em dezembro/2026 tem 23 dias", () => {
  assert.equal(itemDates(rotina).length, 23);
  assert.equal(itemOccurrences(rotina), 23);
  assert.ok(itemDates(rotina).every((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())));
});

test("sem rotina conta 1 vez", () => {
  assert.equal(itemOccurrences({ quantity: 2, unit_price: 10, service_date: "2026-12-01" }), 1);
});

test("total multiplica veículos × dias e corridas batem com o total", () => {
  const it = { ...rotina, quantity: 2 };
  const t = quoteTotals([it], 0);
  assert.equal(t.trips, 46);
  assert.equal(t.subtotal, 46 * 150);
  const amounts = tripAmountsFromQuote([it], 100);
  assert.equal(amounts.length, 46);
  assert.equal(Math.round(amounts.reduce((s, n) => s + n, 0) * 100) / 100, t.subtotal - 100);
});

test("km mínimo: cobra o maior entre rota e mínimo", () => {
  assert.equal(billableKm(38, 50), 50);
  assert.equal(billableKm(62, 50), 62);
  assert.equal(kmAmount(38, 5.5, 50), 275);
  assert.equal(kmAmount(0, 5.5), null);
});

test("resumo da rotina: valor por dia e por mês", () => {
  const base = { quantity: 1, service_date: "2026-12-01", repeat_weekdays: [1, 2, 3, 4, 5], repeat_until: "2027-01-31" };
  const r = routineSummary([{ ...base, unit_price: 150 }, { ...base, unit_price: 150 }, { ...base, unit_price: 140 }, { ...base, unit_price: 140 }]);
  assert.ok(r);
  assert.equal(r.perDay, 580);
  assert.equal(r.tripsPerDay, 4);
  assert.deepEqual(r.months.map((m) => m.days), [23, 21]);
  assert.equal(r.total, 580 * 44);
});

test("rótulo dos dias", () => {
  assert.equal(weekdaysLabel([1, 2, 3, 4, 5]), "seg a sex");
  assert.equal(weekdaysLabel([1, 3, 5]), "seg, qua e sex");
  assert.equal(weekdaysLabel([0, 1, 2, 3, 4, 5, 6]), "todos os dias");
});
