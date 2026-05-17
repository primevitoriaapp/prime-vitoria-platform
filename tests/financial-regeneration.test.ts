import test from "node:test";
import assert from "node:assert/strict";
import { financialTitleBlocksRegeneration, financialTitleStatusLabel } from "../src/lib/finance/financial-regeneration.ts";

test("financialTitleBlocksRegeneration blocks closed financial statuses", () => {
  assert.equal(financialTitleBlocksRegeneration("paid"), true);
  assert.equal(financialTitleBlocksRegeneration("cancelled"), true);
  assert.equal(financialTitleBlocksRegeneration("open"), false);
  assert.equal(financialTitleBlocksRegeneration(null), false);
});

test("financialTitleStatusLabel presents known statuses", () => {
  assert.equal(financialTitleStatusLabel("paid"), "pago");
  assert.equal(financialTitleStatusLabel("cancelled"), "cancelado");
  assert.equal(financialTitleStatusLabel("open"), "open");
  assert.equal(financialTitleStatusLabel(""), "desconhecido");
});
