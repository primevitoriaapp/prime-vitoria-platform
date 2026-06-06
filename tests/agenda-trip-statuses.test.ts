import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENDA_OPERATIONAL_STATUSES,
  isAgendaOperationalStatus
} from "../src/lib/operations/agenda-trip-statuses.ts";
import { parseTripsListQuery } from "../src/lib/trips/trips-list-query.ts";

test("AGENDA_OPERATIONAL_STATUSES includes requested and in_progress", () => {
  assert.ok(AGENDA_OPERATIONAL_STATUSES.includes("requested"));
  assert.ok(AGENDA_OPERATIONAL_STATUSES.includes("approved"));
  assert.ok(AGENDA_OPERATIONAL_STATUSES.includes("dispatched"));
  assert.ok(AGENDA_OPERATIONAL_STATUSES.includes("in_progress"));
  assert.equal(isAgendaOperationalStatus("completed"), false);
});

test("parseTripsListQuery enables agenda mode", () => {
  const q = parseTripsListQuery(new URLSearchParams("agenda=1&pageSize=250"));
  assert.equal(q.agenda, true);
  assert.equal(q.pageSize, 250);
});
