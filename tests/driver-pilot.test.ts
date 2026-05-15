import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleMapsDirectionsUrl, buildWazeNavigateUrl } from "../src/lib/trips/driver-nav-links.ts";
import { driverNextStatuses } from "../src/lib/trips/driver-next-status.ts";

test("buildGoogleMapsDirectionsUrl with coordinates", () => {
  const url = buildGoogleMapsDirectionsUrl({ lat: -20.3, lng: -40.3 });
  assert.match(url, /destination=-20\.3,-40\.3/);
});

test("buildWazeNavigateUrl requires coordinates", () => {
  assert.equal(buildWazeNavigateUrl({ lat: 1, lng: 2 }), "waze://?ll=1,2&navigate=yes");
  assert.equal(buildWazeNavigateUrl({ label: "Vitória" }), null);
});

test("driverNextStatuses from dispatched", () => {
  assert.deepEqual(driverNextStatuses("dispatched"), ["accepted"]);
});

test("driverNextStatuses from on_the_way", () => {
  assert.deepEqual(driverNextStatuses("on_the_way"), ["arrived"]);
});
