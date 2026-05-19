import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  clientMayCancelTrip,
  operationalTransitionMessage,
  planOperationalTransition,
  validateOperationalTransition
} from "../src/lib/domain/status.ts";
import type { TripOperationalStatus } from "../src/lib/domain/types.ts";

const ALL: TripOperationalStatus[] = [
  "requested",
  "approved",
  "dispatched",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
  "no_show",
  "reassigned"
];

test("ALLOWED_TRANSITIONS covers every status", () => {
  for (const s of ALL) {
    assert.ok(Array.isArray(ALLOWED_TRANSITIONS[s]), s);
  }
});

test("terminal states have no outgoing transitions", () => {
  for (const s of ["completed", "cancelled", "rejected", "no_show"] as const) {
    assert.deepEqual(ALLOWED_TRANSITIONS[s], []);
  }
});

test("driver happy path is contiguous", () => {
  const path: TripOperationalStatus[] = [
    "dispatched",
    "accepted",
    "on_the_way",
    "arrived",
    "in_progress",
    "completed"
  ];
  for (let i = 0; i < path.length - 1; i += 1) {
    assert.equal(canTransition(path[i]!, path[i + 1]!), true, `${path[i]} -> ${path[i + 1]}`);
  }
});

test("planOperationalTransition direct and via reassigned", () => {
  assert.deepEqual(planOperationalTransition("approved", "dispatched"), {
    ok: true,
    steps: ["dispatched"]
  });
  assert.deepEqual(planOperationalTransition("accepted", "dispatched"), {
    ok: true,
    steps: ["reassigned", "dispatched"]
  });
  assert.equal(planOperationalTransition("dispatched", "completed").ok, false);
});

test("clientMayCancelTrip only before dispatch chain", () => {
  assert.equal(clientMayCancelTrip("requested"), true);
  assert.equal(clientMayCancelTrip("approved"), true);
  assert.equal(clientMayCancelTrip("dispatched"), false);
  assert.equal(clientMayCancelTrip("completed"), false);
});

test("validateOperationalTransition", () => {
  assert.deepEqual(validateOperationalTransition("dispatched", "accepted"), { ok: true });
  const bad = validateOperationalTransition("dispatched", "completed");
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.message, operationalTransitionMessage("dispatched", "completed"));
  }
});
