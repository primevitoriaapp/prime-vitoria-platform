import test from "node:test";
import assert from "node:assert/strict";
import {
  isPlaceholderEnvValue,
  loadEnvFiles,
  parseDotEnvLine
} from "../src/lib/deploy/env-files.mjs";

test("parseDotEnvLine strips quotes", () => {
  assert.deepEqual(parseDotEnvLine('FOO="bar"'), { key: "FOO", value: "bar" });
});

test("isPlaceholderEnvValue rejects short supabase keys", () => {
  assert.equal(isPlaceholderEnvValue("NEXT_PUBLIC_SUPABASE_URL", "xx"), true);
  assert.equal(
    isPlaceholderEnvValue("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co"),
    false
  );
});

test("loadEnvFiles skips placeholder after real value", () => {
  const env: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: "https://real.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40)
  };
  const dir = process.cwd();
  const loaded = loadEnvFiles({
    cwd: dir,
    env,
    files: [".env.vercel.local"]
  });
  assert.ok(Array.isArray(loaded));
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "https://real.supabase.co");
});
