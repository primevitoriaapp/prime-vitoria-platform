import assert from "node:assert/strict";
import { test } from "node:test";
import {
  driverCanCompleteTrip,
  driverShowsManualKmOnComplete,
  parseDriverKmInput
} from "../src/lib/trips/driver-complete-km.ts";
import type { DriverTripGpsState } from "../src/lib/trips/driver-complete-km.ts";

const gpsOk: DriverTripGpsState = {
  accumulatedKm: 12.5,
  pointCount: 4,
  tracking: true,
  requiresManualKm: false,
  gpsError: null
};

const gpsDenied: DriverTripGpsState = {
  accumulatedKm: null,
  pointCount: 0,
  tracking: false,
  requiresManualKm: true,
  gpsError: "Permissão de localização negada."
};

test("parseDriverKmInput aceita vírgula decimal", () => {
  assert.equal(parseDriverKmInput("12,5"), 12.5);
});

test("driverShowsManualKmOnComplete só quando necessário", () => {
  assert.equal(driverShowsManualKmOnComplete(gpsOk, false), false);
  assert.equal(driverShowsManualKmOnComplete(gpsOk, true), false);
  assert.equal(driverShowsManualKmOnComplete(gpsDenied, true), true);
});

test("driverCanCompleteTrip usa GPS automático quando disponível", () => {
  assert.equal(driverCanCompleteTrip(true, gpsOk, ""), true);
  assert.equal(driverCanCompleteTrip(true, gpsDenied, ""), false);
  assert.equal(driverCanCompleteTrip(true, gpsDenied, "8,2"), true);
});
