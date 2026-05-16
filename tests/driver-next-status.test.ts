import test from "node:test";
import assert from "node:assert/strict";
import { driverNextStatuses } from "../src/lib/trips/driver-next-status.ts";

test("driverNextStatuses from dispatched only accepted (operador trata reassigned)", () => {
  const next = driverNextStatuses("dispatched");
  assert.deepEqual(new Set(next), new Set(["accepted"]));
});

test("driverNextStatuses from in_progress only completed", () => {
  assert.deepEqual(driverNextStatuses("in_progress"), ["completed"]);
});

test("driverNextStatuses from completed is empty", () => {
  assert.deepEqual(driverNextStatuses("completed"), []);
});

test("driverNextStatuses from requested is empty (motorista nao actua)", () => {
  assert.deepEqual(driverNextStatuses("requested"), []);
});

test("driverNextStatuses from arrived includes no_show", () => {
  assert.ok(driverNextStatuses("arrived").includes("no_show"));
  assert.ok(driverNextStatuses("arrived").includes("in_progress"));
});
