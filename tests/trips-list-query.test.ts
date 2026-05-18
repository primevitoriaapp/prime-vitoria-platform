import test from "node:test";
import assert from "node:assert/strict";
import { parseTripsListQuery, tripsListQueryRange } from "../src/lib/trips/trips-list-query.ts";

test("parseTripsListQuery applies pagination defaults", () => {
  const q = parseTripsListQuery(new URLSearchParams(""));
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, 20);
});

test("parseTripsListQuery accepts scoped filters", () => {
  const driverId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const clientId = "11111111-2222-3333-4444-555555555555";
  const q = parseTripsListQuery(
    new URLSearchParams(`status=approved&driverId=${driverId}&clientId=${clientId}&page=2&pageSize=50`)
  );
  assert.equal(q.status, "approved");
  assert.equal(q.driverId, driverId);
  assert.equal(q.clientId, clientId);
  assert.equal(q.page, 2);
  assert.equal(q.pageSize, 50);
});

test("parseTripsListQuery requires ISO datetime filters with offset", () => {
  const q = parseTripsListQuery(
    new URLSearchParams("scheduledFrom=2026-01-01T00:00:00.000Z&scheduledTo=2026-01-02T03:00:00.000-03:00")
  );
  assert.equal(q.scheduledFrom, "2026-01-01T00:00:00.000Z");
  assert.equal(q.scheduledTo, "2026-01-02T03:00:00.000-03:00");
  assert.throws(() => parseTripsListQuery(new URLSearchParams("scheduledFrom=2026-01-01")));
  assert.throws(() => parseTripsListQuery(new URLSearchParams("scheduledTo=amanha")));
});

test("parseTripsListQuery rejects inverted scheduled range", () => {
  assert.throws(
    () =>
      parseTripsListQuery(
        new URLSearchParams("scheduledFrom=2026-01-03T00:00:00.000Z&scheduledTo=2026-01-02T00:00:00.000Z")
      ),
    /scheduledFrom must be before/
  );
});

test("tripsListQueryRange normalizes offsets", () => {
  const range = tripsListQueryRange({
    scheduledFrom: "2026-01-01T00:00:00.000-03:00",
    scheduledTo: "2026-01-01T02:00:00.000-03:00"
  });
  assert.equal(range.scheduledFromIso, "2026-01-01T03:00:00.000Z");
  assert.equal(range.scheduledToIso, "2026-01-01T05:00:00.000Z");
});
