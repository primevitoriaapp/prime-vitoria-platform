import assert from "node:assert/strict";
import { test } from "node:test";
import { isMissingColumnError, mapSupabaseError } from "../src/lib/server/supabase-errors.ts";

test("mapSupabaseError detecta coluna photo_url ausente (migration 0045)", () => {
  const mapped = mapSupabaseError(
    { message: 'column "photo_url" of relation "drivers" does not exist', code: "42703" } as never,
    "motorista"
  );
  assert.equal(mapped.code, "MIGRATION_0044_REQUIRED");
  assert.match(mapped.message, /motorista/i);
});

test("isMissingColumnError reconhece coluna extended drivers", () => {
  assert.equal(
    isMissingColumnError({
      message: "Could not find the 'operational_category' column of 'drivers' in the schema cache"
    } as never),
    true
  );
});
