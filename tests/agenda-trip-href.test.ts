import test from "node:test";
import assert from "node:assert/strict";
import { buildAgendaTripHref } from "../src/lib/operations/agenda-trip-href.ts";

test("buildAgendaTripHref includes trip and date range", () => {
  const href = buildAgendaTripHref(
    "c2000000-0000-4000-8000-000000000001",
    "2026-06-15T14:00:00.000Z"
  );
  assert.match(href, /^\/agenda\?/);
  assert.match(href, /trip=c2000000/);
  assert.match(href, /scheduledFrom=/);
  assert.match(href, /scheduledTo=/);
});
