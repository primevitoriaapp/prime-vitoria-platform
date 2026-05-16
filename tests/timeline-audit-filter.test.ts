import test from "node:test";
import assert from "node:assert/strict";
import { auditActionMatchesPrefix } from "../src/lib/trips/timeline-audit-filter.ts";

test("auditActionMatchesPrefix allows all when prefix empty", () => {
  assert.equal(auditActionMatchesPrefix("trip.status", null), true);
  assert.equal(auditActionMatchesPrefix("trip.status", ""), true);
});

test("auditActionMatchesPrefix filters by prefix", () => {
  assert.equal(auditActionMatchesPrefix("finance.trip_generate", "finance."), true);
  assert.equal(auditActionMatchesPrefix("trip.status", "finance."), false);
});
