import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, geofenceCheck } from "../src/lib/geo/geofence.ts";

const aeroporto = { lat: -20.2582, lng: -40.2864 };
test("distância e raio do local", () => {
  const casa = { lat: -20.3155, lng: -40.3128 };
  assert.ok(distanceMeters(aeroporto, casa) > 6000);
  assert.deepEqual(geofenceCheck({ ...casa, accuracy: 20 }, aeroporto).ok, false);
  assert.equal(geofenceCheck({ lat: -20.2585, lng: -40.2866, accuracy: 30 }, aeroporto).ok, true);
  assert.deepEqual(geofenceCheck(null, aeroporto), { ok: false, reason: "sem_gps", distance: null });
  assert.equal(geofenceCheck(null, { lat: null, lng: null }).ok, true);
});
