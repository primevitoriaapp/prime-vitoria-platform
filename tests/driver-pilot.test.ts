import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAppleMapsNavigateUrl,
  buildDriverNavigationLinks,
  buildGoogleMapsDirectionsUrl,
  buildWazeNavigateUrl
} from "../src/lib/trips/driver-nav-links.ts";
import { driverNextStatuses } from "../src/lib/trips/driver-next-status.ts";

const route = {
  origin: { lat: -20.31, lng: -40.31, label: "Origem" },
  destination: { lat: -20.32, lng: -40.32, label: "Destino" },
  waypoint: { lat: -20.315, lng: -40.315, label: "Parada" }
};

test("buildGoogleMapsDirectionsUrl with origin, destination and waypoint", () => {
  const url = buildGoogleMapsDirectionsUrl(route);
  assert.match(url, /origin=-20\.31%2C-40\.31/);
  assert.match(url, /destination=-20\.32%2C-40\.32/);
  assert.match(url, /waypoints=-20\.315%2C-40\.315/);
});

test("buildWazeNavigateUrl requires coordinates", () => {
  assert.equal(buildWazeNavigateUrl({ lat: 1, lng: 2 }), "waze://?ll=1,2&navigate=yes");
  assert.equal(buildWazeNavigateUrl({ label: "Vitória" }), null);
});

test("buildAppleMapsNavigateUrl with origin and destination", () => {
  const url = buildAppleMapsNavigateUrl(route);
  assert.match(url, /saddr=-20\.31%2C-40\.31/);
  assert.match(url, /daddr=-20\.32%2C-40\.32/);
});

test("buildDriverNavigationLinks returns google, waze, apple", () => {
  const links = buildDriverNavigationLinks(route);
  assert.equal(links.length, 3);
  assert.deepEqual(
    links.map((l) => l.id),
    ["google", "waze", "apple"]
  );
});

test("driverNextStatuses from dispatched", () => {
  assert.deepEqual(driverNextStatuses("dispatched"), ["accepted"]);
});

test("driverNextStatuses from on_the_way", () => {
  assert.deepEqual(driverNextStatuses("on_the_way"), ["arrived"]);
});
