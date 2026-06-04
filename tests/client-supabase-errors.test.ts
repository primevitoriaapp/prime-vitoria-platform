import assert from "node:assert/strict";
import { test } from "node:test";
import { isMissingColumnError, mapSupabaseError } from "../src/lib/server/supabase-errors.ts";

test("mapSupabaseError detecta coluna ausente (migration 0044)", () => {
  const mapped = mapSupabaseError(
    { message: 'column "trade_name" of relation "clients" does not exist', code: "42703" } as never,
    "cliente"
  );
  assert.equal(mapped.code, "MIGRATION_0044_REQUIRED");
  assert.match(mapped.message, /cadastro P1/i);
  assert.ok(mapped.hint?.includes("0044"));
});

test("isMissingColumnError reconhece schema cache PostgREST", () => {
  assert.equal(
    isMissingColumnError({
      message: "Could not find the 'whatsapp' column of 'clients' in the schema cache"
    } as never),
    true
  );
});

test("mapSupabaseError traduz duplicado", () => {
  const mapped = mapSupabaseError(
    { message: "duplicate key value violates unique constraint", code: "23505" } as never,
    "cliente"
  );
  assert.equal(mapped.code, "DUPLICATE_CLIENT");
  assert.equal(mapped.status, 409);
});
