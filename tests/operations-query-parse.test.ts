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

test("parseOperationsHistoryQuery accepts no_show history status", () => {
  const q = parseOperationsHistoryQuery(new URLSearchParams("status=no_show"));
  assert.equal(q.status, "no_show");
});

test("parseOperationsHistoryQuery rejects invalid scheduled_to", () => {
  assert.throws(() => parseOperationsHistoryQuery(new URLSearchParams("scheduled_to=2026-01-01")));
  assert.throws(() => parseOperationsHistoryQuery(new URLSearchParams("scheduled_to=not-a-date")));
});

test("parseOperationsQueueQuery unclaimedOnly", () => {
  const q = parseOperationsQueueQuery(new URLSearchParams("unclaimedOnly=true&page=2"));
  assert.equal(q.unclaimedOnly, true);
  assert.equal(q.page, 2);
});

test("parseOperationsQueueQuery validates scheduled range as ISO datetime", () => {
  const q = parseOperationsQueueQuery(
    new URLSearchParams("scheduled_from=2026-01-01T00:00:00.000Z&scheduled_to=2026-01-02T00:00:00.000Z")
  );
  assert.equal(q.scheduled_from, "2026-01-01T00:00:00.000Z");
  assert.equal(q.scheduled_to, "2026-01-02T00:00:00.000Z");
  assert.throws(() => parseOperationsQueueQuery(new URLSearchParams("scheduled_from=amanha")));
});
