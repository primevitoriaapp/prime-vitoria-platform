import test from "node:test";
import assert from "node:assert/strict";
import {
  IMMEDIATE_DISPATCH_THRESHOLD_MS,
  isImmediateScheduledTrip,
  shouldBlockOfflineDriverForTrip
} from "../src/lib/dispatch/driver-offline-dispatch.ts";

test("isImmediateScheduledTrip — menos de 30 min", () => {
  const now = new Date("2026-05-29T12:00:00.000Z");
  const in20 = new Date(now.getTime() + 20 * 60_000).toISOString();
  assert.equal(isImmediateScheduledTrip(in20, now), true);
});

test("isImmediateScheduledTrip — mais de 30 min", () => {
  const now = new Date("2026-05-29T12:00:00.000Z");
  const in45 = new Date(now.getTime() + 45 * 60_000).toISOString();
  assert.equal(isImmediateScheduledTrip(in45, now), false);
});

test("shouldBlockOfflineDriverForTrip — futuro permite offline", () => {
  const now = new Date("2026-05-29T12:00:00.000Z");
  const future = new Date(now.getTime() + IMMEDIATE_DISPATCH_THRESHOLD_MS + 60_000).toISOString();
  assert.equal(shouldBlockOfflineDriverForTrip("offline", future, now), false);
});

test("shouldBlockOfflineDriverForTrip — imediato bloqueia offline", () => {
  const now = new Date("2026-05-29T12:00:00.000Z");
  const soon = new Date(now.getTime() + 5 * 60_000).toISOString();
  assert.equal(shouldBlockOfflineDriverForTrip("offline", soon, now), true);
  assert.equal(shouldBlockOfflineDriverForTrip("online", soon, now), false);
});
