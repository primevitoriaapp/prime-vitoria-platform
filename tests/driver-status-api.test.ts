import test from "node:test";
import assert from "node:assert/strict";
import { driverNextStatuses } from "../src/lib/trips/driver-next-status.ts";

test("motorista cannot jump from dispatched to completed", () => {
  const next = driverNextStatuses("dispatched");
  assert.equal(next.includes("completed"), false);
  assert.equal(next.includes("accepted"), true);
});

test("motorista can complete from in_progress", () => {
  const next = driverNextStatuses("in_progress");
  assert.equal(next.includes("completed"), true);
});
