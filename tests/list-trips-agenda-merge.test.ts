import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAgendaTripsSearchParams } from "../src/lib/operations/agenda-trips-query.ts";

test("buildAgendaTripsSearchParams inclui agenda=1", () => {
  const qs = buildAgendaTripsSearchParams({
    scheduledFrom: "2026-05-28T03:00:00.000Z",
    scheduledTo: "2026-05-30T02:59:59.999Z"
  });
  assert.equal(qs.get("agenda"), "1");
  assert.equal(qs.get("pageSize"), "250");
  assert.equal(qs.get("scheduledFrom"), "2026-05-28T03:00:00.000Z");
});
