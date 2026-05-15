import test from "node:test";
import assert from "node:assert/strict";

/** Lógica pura: quais transições disparam push ao motorista. */
function shouldPushDriver(toStatus: string, fromStatus: string, driverId: string | null): boolean {
  if (!driverId) return false;
  if (toStatus === "completed" || toStatus === "cancelled") return true;
  if (toStatus === "dispatched" && fromStatus !== "dispatched") return true;
  return false;
}

test("shouldPushDriver on key transitions", () => {
  assert.equal(shouldPushDriver("completed", "in_progress", "d1"), true);
  assert.equal(shouldPushDriver("cancelled", "dispatched", "d1"), true);
  assert.equal(shouldPushDriver("dispatched", "approved", "d1"), true);
  assert.equal(shouldPushDriver("dispatched", "dispatched", "d1"), false);
  assert.equal(shouldPushDriver("completed", "in_progress", null), false);
});
