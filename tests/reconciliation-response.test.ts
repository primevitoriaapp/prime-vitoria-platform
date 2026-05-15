import test from "node:test";
import assert from "node:assert/strict";
import type { ReconciliationRunOptions } from "../src/lib/jobs/processors.ts";

test("ReconciliationRunOptions supports tenant-scoped runs", () => {
  const scoped: ReconciliationRunOptions = {
    tenantId: "a0000000-0000-0000-0000-000000000001",
    limit: 50
  };
  assert.equal(scoped.limit, 50);
  const global: ReconciliationRunOptions = { limit: 500 };
  assert.equal(global.tenantId, undefined);
});
