import test from "node:test";
import assert from "node:assert/strict";
import { normalizePublicTrackToken } from "../src/lib/public/track-token.ts";

test("accepts base64url tokens length 16-200", () => {
  const t = "a".repeat(32);
  assert.equal(normalizePublicTrackToken(t), t);
  assert.equal(normalizePublicTrackToken(encodeURIComponent(t)), t);
});

test("rejects short or invalid charset", () => {
  assert.equal(normalizePublicTrackToken("short"), null);
  assert.equal(normalizePublicTrackToken("has spaces in token value!!"), null);
});
