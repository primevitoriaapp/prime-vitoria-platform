import test from "node:test";
import assert from "node:assert/strict";
import {
  operationsTripsReportRange,
  parseOperationsTripsReportQuery
} from "../src/lib/reports/operations-trips-query.ts";

test("parseOperationsTripsReportQuery defaults to json format", () => {
  const q = parseOperationsTripsReportQuery(new URLSearchParams(""));
  assert.equal(q.format, "json");
  assert.equal(q.pageSize, 200);
});

test("parseOperationsTripsReportQuery accepts ISO datetimes with offset", () => {
  const q = parseOperationsTripsReportQuery(
    new URLSearchParams(
      "format=csv&scheduledFrom=2026-01-01T00:00:00.000Z&scheduledTo=2026-01-02T03:00:00.000-03:00"
    )
  );
  assert.equal(q.format, "csv");
  assert.equal(q.scheduledFrom, "2026-01-01T00:00:00.000Z");
  assert.equal(q.scheduledTo, "2026-01-02T03:00:00.000-03:00");
});

test("parseOperationsTripsReportQuery rejects ambiguous dates", () => {
  assert.throws(() => parseOperationsTripsReportQuery(new URLSearchParams("scheduledFrom=2026-01-01")));
  assert.throws(() => parseOperationsTripsReportQuery(new URLSearchParams("scheduledTo=not-a-date")));
});

test("parseOperationsTripsReportQuery rejects inverted ranges", () => {
  assert.throws(
    () =>
      parseOperationsTripsReportQuery(
        new URLSearchParams("scheduledFrom=2026-01-03T00:00:00.000Z&scheduledTo=2026-01-02T00:00:00.000Z")
      ),
    /scheduledFrom must be before/
  );
});

test("operationsTripsReportRange normalizes offsets to ISO", () => {
  const range = operationsTripsReportRange({
    scheduledFrom: "2026-01-01T00:00:00.000-03:00",
    scheduledTo: "2026-01-01T02:00:00.000-03:00"
  });
  assert.equal(range.scheduledFromIso, "2026-01-01T03:00:00.000Z");
  assert.equal(range.scheduledToIso, "2026-01-01T05:00:00.000Z");
});
