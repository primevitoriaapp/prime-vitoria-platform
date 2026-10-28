import test from "node:test";
import assert from "node:assert/strict";
import { flightTrackerUrl, normalizeFlightNumber } from "../src/lib/trips/flight.ts";

test("normalizeFlightNumber", () => {
  assert.equal(normalizeFlightNumber("la 3345"), "LA3345");
  assert.equal(normalizeFlightNumber("G3-1450"), "G31450");
  assert.equal(normalizeFlightNumber("AD4321"), "AD4321");
  assert.equal(normalizeFlightNumber("TAM8090"), "TAM8090");
  assert.equal(normalizeFlightNumber("1234"), null);
  assert.equal(normalizeFlightNumber(""), null);
  assert.equal(flightTrackerUrl("LA3345"), "https://www.flightradar24.com/data/flights/la3345");
});
