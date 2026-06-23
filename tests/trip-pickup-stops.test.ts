import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allPickupStopsCompleted,
  markPickupStopCompleted,
  movePickupStop,
  nextIncompletePickupStopIndex
} from "../src/lib/trips/trip-pickup-stops.ts";

const stops = [
  {
    pickup_text: "Rua A",
    passenger_name: "João",
    passenger_phone: null,
    completed_at: null
  },
  {
    pickup_text: "Rua B",
    passenger_name: "Maria",
    passenger_phone: null,
    completed_at: null
  }
];

test("nextIncompletePickupStopIndex retorna primeira parada pendente", () => {
  assert.equal(nextIncompletePickupStopIndex(stops), 0);
});

test("markPickupStopCompleted exige ordem sequencial", () => {
  const first = markPickupStopCompleted(stops, 0);
  assert.ok(first[0].completed_at);
  assert.equal(nextIncompletePickupStopIndex(first), 1);
  const skip = markPickupStopCompleted(stops, 1);
  assert.equal(skip, stops);
});

test("allPickupStopsCompleted quando todas marcadas", () => {
  const done = markPickupStopCompleted(markPickupStopCompleted(stops, 0), 1);
  assert.equal(allPickupStopsCompleted(done), true);
});

test("movePickupStop reordena paradas", () => {
  const moved = movePickupStop(stops, 0, 1);
  assert.equal(moved[0].passenger_name, "Maria");
  assert.equal(moved[1].passenger_name, "João");
});
