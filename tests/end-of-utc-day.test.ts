import test from "node:test";
import assert from "node:assert/strict";
import { endOfUtcDayIsoFromDateInput } from "../src/lib/datetime/end-of-utc-day.ts";

test("endOfUtcDayIsoFromDateInput returns end of UTC day", () => {
  const iso = endOfUtcDayIsoFromDateInput("2026-03-15");
  assert.equal(iso, "2026-03-15T23:59:59.999Z");
});

test("endOfUtcDayIsoFromDateInput rejects invalid", () => {
  assert.equal(endOfUtcDayIsoFromDateInput("15-03-2026"), null);
  assert.equal(endOfUtcDayIsoFromDateInput("2026-3-15"), null);
  assert.equal(endOfUtcDayIsoFromDateInput(""), null);
});
