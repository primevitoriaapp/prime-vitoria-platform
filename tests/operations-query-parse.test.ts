import test from "node:test";
import assert from "node:assert/strict";
import { parseOperationsHistoryQuery } from "../src/lib/operations/operations-history-query.ts";
import { parseOperationsQueueQuery } from "../src/lib/operations/operations-queue-query.ts";

test("parseOperationsHistoryQuery defaults to json format", () => {
  const q = parseOperationsHistoryQuery(new URLSearchParams(""));
  assert.equal(q.format, "json");
});

test("parseOperationsHistoryQuery format csv", () => {
  const q = parseOperationsHistoryQuery(new URLSearchParams("format=csv"));
  assert.equal(q.format, "csv");
  assert.equal(q.days, 14);
});

test("parseOperationsHistoryQuery optional filters", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const q = parseOperationsHistoryQuery(
    new URLSearchParams(`client_id=${id}&status=completed&scheduled_to=2026-01-01T00:00:00.000Z`)
  );
  assert.equal(q.client_id, id);
  assert.equal(q.status, "completed");
  assert.equal(q.scheduled_to, "2026-01-01T00:00:00.000Z");
});

test("parseOperationsQueueQuery unclaimedOnly", () => {
  const q = parseOperationsQueueQuery(new URLSearchParams("unclaimedOnly=true&page=2"));
  assert.equal(q.unclaimedOnly, true);
  assert.equal(q.page, 2);
});
