import test from "node:test";
import assert from "node:assert/strict";
import { parseDriverPayablesListQuery } from "../src/lib/finance/driver-payables-query.ts";

test("parseDriverPayablesListQuery applies defaults", () => {
  const q = parseDriverPayablesListQuery(new URLSearchParams(""));
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, 50);
});

test("parseDriverPayablesListQuery accepts status and due date range", () => {
  const q = parseDriverPayablesListQuery(
    new URLSearchParams("status=paid&due_from=2026-05-01&due_to=2026-05-31&page=2&pageSize=25")
  );
  assert.equal(q.status, "paid");
  assert.equal(q.due_from, "2026-05-01");
  assert.equal(q.due_to, "2026-05-31");
  assert.equal(q.page, 2);
  assert.equal(q.pageSize, 25);
});

test("parseDriverPayablesListQuery rejects invalid filters", () => {
  assert.throws(() => parseDriverPayablesListQuery(new URLSearchParams("status=unknown")));
  assert.throws(() => parseDriverPayablesListQuery(new URLSearchParams("due_from=2026-5-1")));
  assert.throws(() => parseDriverPayablesListQuery(new URLSearchParams("due_to=2026-02-31")));
  assert.throws(
    () => parseDriverPayablesListQuery(new URLSearchParams("due_from=2026-06-01&due_to=2026-05-31")),
    /due_to must be after/
  );
});
