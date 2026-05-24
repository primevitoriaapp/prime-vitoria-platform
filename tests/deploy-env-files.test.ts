import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyBaseUrlFallback,
  isPlaceholderEnvValue,
  loadEnvFiles,
  parseDotEnvLine
} from "../src/lib/deploy/env-files.mjs";

test("parseDotEnvLine parses quoted values and skips comments", () => {
  assert.deepEqual(parseDotEnvLine('NEXT_PUBLIC_BASE_URL="https://example.test"'), {
    key: "NEXT_PUBLIC_BASE_URL",
    value: "https://example.test"
  });
  assert.equal(parseDotEnvLine("# comment"), null);
  assert.equal(parseDotEnvLine("not-valid"), null);
});

test("loadEnvFiles loads ordered env files without replacing non-empty values", () => {
  const cwd = mkdtempSync(join(tmpdir(), "prime-vitoria-env-"));
  const env = { SUPABASE_SERVICE_ROLE_KEY: "already-set", NEXT_PUBLIC_SUPABASE_URL: "" };

  try {
    writeFileSync(
      join(cwd, ".env.supabase.local"),
      [
        "NEXT_PUBLIC_SUPABASE_URL=https://supabase.test",
        "SUPABASE_SERVICE_ROLE_KEY=from-file"
      ].join("\n")
    );
    writeFileSync(join(cwd, ".env.local"), "NEXT_PUBLIC_BASE_URL=https://app.test\n");

    const loaded = loadEnvFiles({ cwd, env });

    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "https://supabase.test");
    assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "already-set");
    assert.equal(env.NEXT_PUBLIC_BASE_URL, "https://app.test");
    assert.deepEqual(
      loaded.map(({ file, key }) => `${file}:${key}`),
      [".env.supabase.local:NEXT_PUBLIC_SUPABASE_URL", ".env.local:NEXT_PUBLIC_BASE_URL"]
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("isPlaceholderEnvValue ignores vercel-style short placeholders", () => {
  assert.equal(isPlaceholderEnvValue("NEXT_PUBLIC_SUPABASE_URL", "xx"), true);
  assert.equal(isPlaceholderEnvValue("SUPABASE_SERVICE_ROLE_KEY", "from-file"), true);
});

test("applyBaseUrlFallback fills NEXT_PUBLIC_BASE_URL from BASE_URL only when missing", () => {
  const env = { BASE_URL: " https://preview.test " };

  assert.equal(applyBaseUrlFallback(env), true);
  assert.equal(env.NEXT_PUBLIC_BASE_URL, "https://preview.test");

  env.BASE_URL = "https://other.test";
  assert.equal(applyBaseUrlFallback(env), false);
  assert.equal(env.NEXT_PUBLIC_BASE_URL, "https://preview.test");
});
