import test from "node:test";
import assert from "node:assert/strict";
import { payoutStage } from "../src/lib/finance/payout-stage.ts";

test("repasse só libera quando o cliente paga", () => {
  assert.equal(payoutStage("open", "open"), "aguardando_cliente");
  assert.equal(payoutStage("open", null), "aguardando_cliente");
  assert.equal(payoutStage("open", "paid"), "liberado");
  assert.equal(payoutStage("paid", "open"), "pago");
  assert.equal(payoutStage("cancelled", "paid"), "cancelado");
});
