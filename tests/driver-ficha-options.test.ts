import test from "node:test";
import assert from "node:assert/strict";
import {
  activeFlagsFromOperationalStatus,
  cnhCategoriesFromRow,
  isCnhExpiringWithinDays,
  operationalStatusFromRow
} from "../src/lib/drivers/driver-ficha-options.ts";

test("operationalStatusFromRow infers ferias when unavailable", () => {
  assert.equal(operationalStatusFromRow({ active: true, available: false }), "ferias");
});

test("activeFlagsFromOperationalStatus maps ferias", () => {
  const flags = activeFlagsFromOperationalStatus("ferias");
  assert.equal(flags.active, true);
  assert.equal(flags.available, false);
});

test("cnhCategoriesFromRow parses legacy cnh_category", () => {
  assert.deepEqual(cnhCategoriesFromRow({ cnh_category: "A,B" }), ["A", "B"]);
});

test("isCnhExpiringWithinDays within 30 days", () => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 10);
  const iso = soon.toISOString().slice(0, 10);
  assert.equal(isCnhExpiringWithinDays(iso), true);
});
