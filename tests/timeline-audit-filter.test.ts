import test from "node:test";
import assert from "node:assert/strict";
import { auditActionMatchesPrefix, uniqueAuditRowsById } from "../src/lib/trips/timeline-audit-filter.ts";

test("auditActionMatchesPrefix allows all when prefix empty", () => {
  assert.equal(auditActionMatchesPrefix("trip.status", null), true);
  assert.equal(auditActionMatchesPrefix("trip.status", ""), true);
});

test("auditActionMatchesPrefix filters by prefix", () => {
  assert.equal(auditActionMatchesPrefix("finance.trip_generate", "finance."), true);
  assert.equal(auditActionMatchesPrefix("trip.status", "finance."), false);
});

test("uniqueAuditRowsById keeps first occurrence", () => {
  const rows = uniqueAuditRowsById([
    { id: "a1", action: "trip.status" },
    { id: "a2", action: "finance.trip_generate" },
    { id: "a1", action: "duplicate" }
  ]);
  assert.deepEqual(rows, [
    { id: "a1", action: "trip.status" },
    { id: "a2", action: "finance.trip_generate" }
  ]);
});
