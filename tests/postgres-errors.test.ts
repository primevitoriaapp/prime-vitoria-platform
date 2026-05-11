import test from "node:test";
import assert from "node:assert/strict";
import { isPostgresUniqueViolation } from "../src/lib/server/postgres-errors.ts";

test("detects code 23505", () => {
  assert.equal(isPostgresUniqueViolation({ code: "23505", message: "x" }), true);
});

test("detects duplicate key message", () => {
  assert.equal(
    isPostgresUniqueViolation({ message: 'duplicate key value violates unique constraint "dispatch_offer_responses_offer_id_driver_id_key"' }),
    true
  );
});

test("non-unique errors false", () => {
  assert.equal(isPostgresUniqueViolation({ code: "23503", message: "fk" }), false);
  assert.equal(isPostgresUniqueViolation(null), false);
});

test("dispatch candidate ids uniqueness guard (same as Zod refine)", () => {
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  const id = "11111111-1111-1111-1111-111111111111";
  assert.equal(unique([id, id]), false);
  assert.equal(unique([id, "22222222-2222-2222-2222-222222222222"]), true);
});
