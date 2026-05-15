import test from "node:test";
import assert from "node:assert/strict";
import { isPostgresUniqueViolation } from "../src/lib/server/postgres-errors.ts";

test("Supabase-style unique violation object is detected", () => {
  assert.equal(
    isPostgresUniqueViolation({
      code: "23505",
      details: null,
      hint: null,
      message: 'duplicate key value violates unique constraint "uq_erp_sync_jobs_queued_entity"'
    }),
    true
  );
});
