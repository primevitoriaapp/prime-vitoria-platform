import test from "node:test";
import assert from "node:assert/strict";
import { parseReceivablesListQuery } from "../src/lib/finance/receivables-query.ts";

test("parseReceivablesListQuery applies defaults", () => {
  const q = parseReceivablesListQuery(new URLSearchParams(""));
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, 50);
});

test("parseReceivablesListQuery accepts status and due date range", () => {
  const q = parseReceivablesListQuery(
    new URLSearchParams("status=open&due_from=2026-05-01&due_to=2026-05-31&page=2&pageSize=25")
  );
  assert.equal(q.status, "open");
  assert.equal(q.due_from, "2026-05-01");
  assert.equal(q.due_to, "2026-05-31");
  assert.equal(q.page, 2);
  assert.equal(q.pageSize, 25);
});

test("parseReceivablesListQuery rejects invalid filters", () => {
  assert.throws(() => parseReceivablesListQuery(new URLSearchParams("status=unknown")));
  assert.throws(() => parseReceivablesListQuery(new URLSearchParams("due_from=2026-5-1")));
  assert.throws(() => parseReceivablesListQuery(new URLSearchParams("due_to=2026-02-31")));
  assert.throws(
    () => parseReceivablesListQuery(new URLSearchParams("due_from=2026-06-01&due_to=2026-05-31")),
    /due_to must be after/
  );
});
