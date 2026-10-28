import test from "node:test";
import assert from "node:assert/strict";
import { bandeiraForIso, enabledModes, legacyServiceType, priceFromCategoryTable, type PriceCell } from "../src/lib/pricing/category-catalog.ts";

const cell = (service: PriceCell["service"], client: number | null, partner: number | null = null, enabled = true): PriceCell => ({
  service,
  enabled,
  client_price: client,
  partner_price: partner
});

test("modos liberados e tipo legado", () => {
  assert.deepEqual(enabledModes([cell("transfer", null), cell("diaria_10h", 900), cell("km_b2", 4, null, false)]), ["transfer", "diaria_10h"]);
  assert.deepEqual(enabledModes([cell("km_b1", 4)]), ["km"]);
  assert.equal(legacyServiceType("carro", "transfer"), "transfer_seda");
  assert.equal(legacyServiceType("van", "diaria_5h"), "diaria_van");
  assert.equal(legacyServiceType("onibus", "km"), "corporativo");
});

test("bandeira pelo horário de Brasília", () => {
  assert.equal(bandeiraForIso("2026-10-29T12:00:00Z"), "km_b1"); // 09h
  assert.equal(bandeiraForIso("2026-10-29T22:30:00Z"), "km_b2"); // 19h30
  assert.equal(bandeiraForIso("2026-10-29T08:59:00Z"), "km_b2"); // 05h59
});

test("preço pela tabela", () => {
  const cells = [cell("transfer", 250, 150), cell("diaria_10h", 900, 600), cell("hora_extra", 60, 40), cell("km_b1", 4, 2.5), cell("km_b2", 4.5, 3)];
  assert.deepEqual(priceFromCategoryTable({ mode: "transfer", scheduledAt: "2026-10-29T12:00:00Z", km: 20, cells }), { client: 250, partner: 150, detail: "transfer" });
  assert.deepEqual(priceFromCategoryTable({ mode: "km", scheduledAt: "2026-10-29T12:00:00Z", km: 30, cells }), { client: 120, partner: 75, detail: "30 km × bandeira 1" });
  assert.deepEqual(priceFromCategoryTable({ mode: "diaria_10h", scheduledAt: "2026-10-29T12:00:00Z", km: null, usedHours: 11.2, cells }), {
    client: 990,
    partner: 660,
    detail: "diária 10h + 1.5h extra"
  });
  assert.equal(priceFromCategoryTable({ mode: "diaria_5h", scheduledAt: "x", km: null, cells }).client, null);
});
