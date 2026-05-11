import test from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "../src/lib/domain/status.ts";
import { calculateNetMargin } from "../src/lib/finance/margin.ts";
import { hasDispatchConflict } from "../src/lib/dispatch/conflicts.ts";
import { erpIntegrationMode } from "../src/lib/integrations/erp-mode.ts";

test("operational status machine blocks invalid jump", () => {
  assert.equal(canTransition("dispatched", "completed"), false);
  assert.equal(canTransition("dispatched", "accepted"), true);
});

test("margin calculation", () => {
  assert.equal(
    calculateNetMargin({
      amount_client: 200,
      amount_driver: 120,
      tolls: 10,
      parking: 5,
      extras: 20,
      discount: 0
    }),
    85
  );
});

test("dispatch conflict within buffer", () => {
  const conflict = hasDispatchConflict(
    [{ tripId: "1", scheduledAt: "2026-05-10T10:00:00.000Z", status: "accepted" }],
    "2026-05-10T10:45:00.000Z"
  );
  assert.equal(conflict, true);
});

test("ERP mode is mock without credentials", () => {
  assert.equal(erpIntegrationMode("conta_azul"), "mock");
  assert.equal(erpIntegrationMode("omie"), "mock");
});
