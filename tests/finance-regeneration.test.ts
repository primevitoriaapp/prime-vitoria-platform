import test from "node:test";
import assert from "node:assert/strict";
import { financialTitleBlocksRegeneration, financialTitleStatusLabel } from "../src/lib/finance/financial-regeneration.ts";

test("financialTitleBlocksRegeneration locks paid and cancelled titles", () => {
  assert.equal(financialTitleBlocksRegeneration("paid"), true);
  assert.equal(financialTitleBlocksRegeneration("cancelled"), true);
  assert.equal(financialTitleBlocksRegeneration("open"), false);
  assert.equal(financialTitleBlocksRegeneration(null), false);
});

test("financialTitleStatusLabel maps known statuses", () => {
  assert.equal(financialTitleStatusLabel("paid"), "pago");
  assert.equal(financialTitleStatusLabel("cancelled"), "cancelado");
  assert.equal(financialTitleStatusLabel("open"), "open");
  assert.equal(financialTitleStatusLabel(""), "desconhecido");
});
