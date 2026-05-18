import test from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "../src/lib/domain/status.ts";
import { calculateNetMargin } from "../src/lib/finance/margin.ts";
import { dispatchConflict, hasDispatchConflict, isDispatchActiveStatus } from "../src/lib/dispatch/conflicts.ts";
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

test("dispatchConflict ignores current trip when requested", () => {
  const schedule = [{ tripId: "current", scheduledAt: "2026-05-10T10:00:00.000Z", status: "accepted" }];
  assert.equal(dispatchConflict(schedule, "2026-05-10T10:20:00.000Z", 90, "current"), null);
});

test("dispatchConflict ignores terminal trips and invalid dates", () => {
  const schedule = [
    { tripId: "done", scheduledAt: "2026-05-10T10:00:00.000Z", status: "completed" },
    { tripId: "bad", scheduledAt: "not-a-date", status: "accepted" }
  ];
  assert.equal(dispatchConflict(schedule, "2026-05-10T10:20:00.000Z"), null);
  assert.equal(dispatchConflict(schedule, "not-a-date"), null);
});

test("dispatchConflict treats reassigned trips as active", () => {
  const conflict = dispatchConflict(
    [{ tripId: "reassigned", scheduledAt: "2026-05-10T10:00:00.000Z", status: "reassigned" }],
    "2026-05-10T10:20:00.000Z"
  );
  assert.equal(conflict?.tripId, "reassigned");
  assert.equal(isDispatchActiveStatus("reassigned"), true);
  assert.equal(isDispatchActiveStatus("completed"), false);
});

test("ERP mode is mock without credentials", () => {
  assert.equal(erpIntegrationMode("conta_azul"), "mock");
  assert.equal(erpIntegrationMode("omie"), "mock");
});
