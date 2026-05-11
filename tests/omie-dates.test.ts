import test from "node:test";
import assert from "node:assert/strict";
import { formatOmieDate } from "../src/lib/integrations/omie-http.ts";

test("formatOmieDate formats YYYY-MM-DD to DD/MM/YYYY UTC", () => {
  assert.equal(formatOmieDate("2026-05-09"), "09/05/2026");
});

test("formatOmieDate accepts ISO datetime", () => {
  assert.equal(formatOmieDate("2026-12-31T00:00:00.000Z"), "31/12/2026");
});
