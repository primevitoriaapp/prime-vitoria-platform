import test from "node:test";
import assert from "node:assert/strict";
import {
  driverOperationalHint,
  driverPrimaryActionLabel,
  pickPrimaryActiveTripId
} from "../src/lib/trips/driver-step-copy.ts";

test("driverOperationalHint for dispatched", () => {
  assert.match(driverOperationalHint("dispatched"), /aceite/i);
});

test("driverPrimaryActionLabel accept", () => {
  assert.equal(driverPrimaryActionLabel("dispatched", "accepted"), "Aceitar corrida");
});

test("driverPrimaryActionLabel full flow", () => {
  assert.equal(driverPrimaryActionLabel("accepted", "on_the_way"), "A caminho do passageiro");
  assert.equal(driverPrimaryActionLabel("on_the_way", "arrived"), "Cheguei ao local");
  assert.equal(driverPrimaryActionLabel("arrived", "in_progress"), "Iniciar corrida");
  assert.equal(driverPrimaryActionLabel("in_progress", "completed"), "Finalizar corrida");
});

test("pickPrimaryActiveTripId prefers in_progress", () => {
  const id = pickPrimaryActiveTripId([
    { id: "a", operational_status: "dispatched", scheduled_at: "2026-01-01T10:00:00Z" },
    { id: "b", operational_status: "in_progress", scheduled_at: "2026-01-01T11:00:00Z" }
  ]);
  assert.equal(id, "b");
});
