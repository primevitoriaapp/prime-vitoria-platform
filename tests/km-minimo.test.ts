import { test } from "node:test";
import assert from "node:assert/strict";
import { priceFromCategoryTable } from "../src/lib/pricing/category-catalog.ts";

const cells = [
  { service: "km_b1" as const, enabled: true, client_price: 5, partner_price: 3 },
  { service: "km_minimo" as const, enabled: true, client_price: 20, partner_price: null }
];
const day = "2026-11-03T15:00:00Z"; // 12h em Brasília → bandeira 1

test("corrida curta cobra o KM mínimo do veículo", () => {
  const r = priceFromCategoryTable({ mode: "km", scheduledAt: day, km: 5.5, cells });
  assert.equal(r.client, 100); // 20 km × 5
  assert.equal(r.partner, 16.5); // motorista pelo km real
  assert.match(r.detail, /mínimo de 20 km/);
});

test("corrida longa cobra o km real", () => {
  assert.equal(priceFromCategoryTable({ mode: "km", scheduledAt: day, km: 32, cells }).client, 160);
});

test("sem mínimo no veículo usa o geral da empresa", () => {
  const r = priceFromCategoryTable({ mode: "km", scheduledAt: day, km: 5, cells: [cells[0]], minKmClient: 15 });
  assert.equal(r.client, 75);
});
