import test from "node:test";
import assert from "node:assert/strict";
import { postTripAutomationFailureMetadata } from "../src/lib/trips/post-trip-automation-failure.ts";

test("postTripAutomationFailureMetadata serializes Error", () => {
  const metadata = postTripAutomationFailureMetadata(new TypeError("boom"));
  assert.deepEqual(metadata, { message: "boom", name: "TypeError" });
});

test("postTripAutomationFailureMetadata serializes unknown throwables", () => {
  assert.deepEqual(postTripAutomationFailureMetadata("falhou"), { message: "falhou" });
});
