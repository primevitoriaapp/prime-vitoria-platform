import test from "node:test";
import assert from "node:assert/strict";
import { timelineAuditLabel, timelineMetadataLabel, timelineMetadataSummary } from "../src/lib/trips/timeline-present.ts";

test("timelineAuditLabel maps known audit actions", () => {
  assert.equal(timelineAuditLabel("trip.dispatch_directed"), "Despacho direto");
  assert.equal(timelineAuditLabel("finance.driver_payable_auto"), "Pagável motorista automático");
  assert.equal(timelineAuditLabel("custom.action"), "custom.action");
});

test("timelineMetadataSummary formats compact metadata", () => {
  assert.equal(
    timelineMetadataSummary({ driver_id: "abc", amount: 123.45, nested: { ok: true }, empty: null }, 3),
    "Motorista: abc · Valor: 123.45 · nested: {...}"
  );
});

test("timelineMetadataLabel maps common operational keys", () => {
  assert.equal(timelineMetadataLabel("planned_km"), "KM planejado");
  assert.equal(timelineMetadataLabel("km_source"), "Fonte KM");
  assert.equal(timelineMetadataLabel("unknown_key"), "unknown_key");
});
