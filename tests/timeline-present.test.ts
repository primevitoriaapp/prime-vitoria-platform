import test from "node:test";
import assert from "node:assert/strict";
import { timelineAuditLabel, timelineMetadataSummary } from "../src/lib/trips/timeline-present.ts";

test("timelineAuditLabel maps known audit actions", () => {
  assert.equal(timelineAuditLabel("trip.dispatch_directed"), "Despacho direto");
  assert.equal(timelineAuditLabel("finance.driver_payable_auto"), "Pagável motorista automático");
  assert.equal(timelineAuditLabel("custom.action"), "custom.action");
});

test("timelineMetadataSummary formats compact metadata", () => {
  assert.equal(
    timelineMetadataSummary({ driver_id: "abc", amount: 123.45, nested: { ok: true }, empty: null }, 3),
    "driver_id: abc · amount: 123.45 · nested: {...}"
  );
});
