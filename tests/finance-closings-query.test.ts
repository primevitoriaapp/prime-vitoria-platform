import test from "node:test";
import assert from "node:assert/strict";
import { isValidIsoDateOnly } from "../src/lib/datetime/iso-date-only.ts";
import { parseFinanceClosingsListQuery } from "../src/lib/finance/closings-query.ts";

test("parseFinanceClosingsListQuery applies defaults", () => {
  const q = parseFinanceClosingsListQuery(new URLSearchParams(""));
  assert.equal(q.format, "json");
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, 50);
});

test("parseFinanceClosingsListQuery accepts date-only period filters", () => {
  const q = parseFinanceClosingsListQuery(
    new URLSearchParams("format=csv&period_start=2026-05-01&period_end=2026-05-31&status=closed&pageSize=100")
  );
  assert.equal(q.format, "csv");
  assert.equal(q.period_start, "2026-05-01");
  assert.equal(q.period_end, "2026-05-31");
  assert.equal(q.status, "closed");
  assert.equal(q.pageSize, 100);
});

test("parseFinanceClosingsListQuery rejects invalid dates and inverted period", () => {
  assert.throws(() => parseFinanceClosingsListQuery(new URLSearchParams("period_start=2026-5-1")));
  assert.throws(() => parseFinanceClosingsListQuery(new URLSearchParams("period_end=2026-05-32")));
  assert.throws(
    () => parseFinanceClosingsListQuery(new URLSearchParams("period_start=2026-06-01&period_end=2026-05-31")),
    /period_end must be after/
  );
});

test("isValidIsoDateOnly validates calendar dates", () => {
  assert.equal(isValidIsoDateOnly("2026-02-28"), true);
  assert.equal(isValidIsoDateOnly("2026-02-29"), false);
  assert.equal(isValidIsoDateOnly("2028-02-29"), true);
});
