import test from "node:test";
import assert from "node:assert/strict";
import { postTripAutomationFailureMetadata } from "../src/lib/trips/post-trip-automation-failure.ts";
import { postTripKmSource } from "../src/lib/trips/post-trip-km-source.ts";

test("postTripAutomationFailureMetadata serializes Error", () => {
  const metadata = postTripAutomationFailureMetadata(new TypeError("boom"));
  assert.deepEqual(metadata, { message: "boom", name: "TypeError" });
});

test("postTripAutomationFailureMetadata serializes unknown throwables", () => {
  assert.deepEqual(postTripAutomationFailureMetadata("falhou"), { message: "falhou" });
});

test("postTripKmSource prioritizes GPS trail and preserves manual actual KM", () => {
  assert.equal(postTripKmSource({ plannedKm: 12, actualKmFromTrail: 13, previousActualKm: 11 }), "gps_trail");
  assert.equal(postTripKmSource({ plannedKm: 12, actualKmFromTrail: null, previousActualKm: 11 }), "manual");
  assert.equal(postTripKmSource({ plannedKm: 12, actualKmFromTrail: null, previousActualKm: null }), "coords");
  assert.equal(postTripKmSource({ plannedKm: null, actualKmFromTrail: null, previousActualKm: null }), null);
});
