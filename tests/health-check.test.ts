import test from "node:test";
import assert from "node:assert/strict";
import { buildHealthPayload } from "../src/lib/server/health-check.ts";

test("buildHealthPayload basic is always ok", () => {
  const p = buildHealthPayload(false);
  assert.equal(p.ok, true);
  assert.equal(p.service, "prime-vitoria-platform");
  assert.equal(p.checks, undefined);
});

test("buildHealthPayload detailed fails without supabase public env", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const p = buildHealthPayload(true);
    assert.equal(p.ok, false);
    assert.equal(p.checks?.supabase_public, false);
  } finally {
    if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  }
});
