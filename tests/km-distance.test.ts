import test from "node:test";
import assert from "node:assert/strict";
import { actualKmFromTrail, haversineKm, plannedKmFromCoords } from "../src/lib/trips/km-distance.ts";

test("haversineKm returns positive distance for distinct points", () => {
  const km = haversineKm(-20.3155, -40.3128, -20.29, -40.28);
  assert.ok(km > 0 && km < 50);
});

test("plannedKmFromCoords null when coords missing", () => {
  assert.equal(plannedKmFromCoords({ origin_lat: null, origin_lng: 0, destination_lat: 0, destination_lng: 0 }), null);
});

test("plannedKmFromCoords computes when all set", () => {
  const km = plannedKmFromCoords({
    origin_lat: -20.3155,
    origin_lng: -40.3128,
    destination_lat: -20.29,
    destination_lng: -40.28
  });
  assert.ok(km != null && km > 0);
});

test("actualKmFromTrail sums segments", () => {
  const km = actualKmFromTrail([
    { lat: -20.31, lng: -40.31, recorded_at: "2026-01-01T10:00:00Z" },
    { lat: -20.32, lng: -40.32, recorded_at: "2026-01-01T10:05:00Z" },
    { lat: -20.33, lng: -40.33, recorded_at: "2026-01-01T10:10:00Z" }
  ]);
  assert.ok(km != null && km > 0);
});

test("actualKmFromTrail null with single point", () => {
  assert.equal(
    actualKmFromTrail([{ lat: -20.31, lng: -40.31, recorded_at: "2026-01-01T10:00:00Z" }]),
    null
  );
});
