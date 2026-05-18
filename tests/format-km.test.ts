import test from "node:test";
import assert from "node:assert/strict";
import { formatTripKmLine } from "../src/lib/trips/format-km.ts";

test("formatTripKmLine actual with planned", () => {
  const line = formatTripKmLine({ planned_km: 12, actual_km: 14.2 });
  assert.match(line ?? "", /14\.2 km \(realizado\)/);
  assert.match(line ?? "", /planeado 12\.0 km/);
});

test("formatTripKmLine planned only", () => {
  assert.equal(formatTripKmLine({ planned_km: 8 }), "8.0 km (planeado)");
});

test("formatTripKmLine empty", () => {
  assert.equal(formatTripKmLine({}), null);
});

test("formatTripKmLine ignores non-finite values", () => {
  assert.equal(formatTripKmLine({ planned_km: Number.POSITIVE_INFINITY, actual_km: Number.NaN }), null);
  assert.equal(formatTripKmLine({ planned_km: 10, actual_km: Number.NaN }), "10.0 km (planeado)");
});
