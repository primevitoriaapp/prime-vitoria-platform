import { test } from "node:test";
import assert from "node:assert/strict";

import { priceFromCategoryTable as priceMin } from "../src/lib/pricing/category-catalog.ts";
test("km mínimo do cliente: cobra 20 km, parceiro recebe o real", () => {
  const r = priceMin({
    mode: "km",
    scheduledAt: "2026-10-29T15:00:00.000Z",
    km: 10,
    cells: [{ service: "km_b1", enabled: true, client_price: 4, partner_price: 3 }],
    minKmClient: 20
  });
  assert.equal(r.client, 80);
  assert.equal(r.partner, 30);
});
