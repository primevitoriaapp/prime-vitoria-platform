import { test } from "node:test";
import assert from "node:assert/strict";
import { reorderStops, suggestOrder } from "../src/lib/trips/stop-order.ts";

const origin = { lat: -20.314, lng: -40.2914 }; // TRT, Enseada do Suá
const far = { passenger_name: "Catarina", lat: -20.2819, lng: -40.2982 }; // Jardim da Penha
const near = { passenger_name: "Marilia", lat: -20.2744, lng: -40.2841, final: true }; // Mata da Praia

test("trocar a ordem passa o destino final para a última parada", () => {
  const next = reorderStops([far, near], [1, 0]);
  assert.ok(next);
  assert.equal(next![0].passenger_name, "Marilia");
  assert.equal(next![0].final, false);
  assert.equal(next![1].final, true);
});

test("paradas já feitas não mudam de lugar", () => {
  const done = { ...far, dropped_at: "2026-11-13T22:30:00Z" };
  const c = { passenger_name: "Ana", lat: -20.29, lng: -40.3 };
  assert.equal(reorderStops([done, near, c], [0, 1]), null);
  const next = reorderStops([done, near, c], [2, 1]);
  assert.deepEqual(next!.map((s) => s.passenger_name), ["Catarina", "Ana", "Marilia"]);
});

test("sugere a ordem mais curta", () => {
  const s = suggestOrder(origin, [near, far]);
  assert.ok(s);
  assert.deepEqual(s!.order, [1, 0]);
  assert.ok(s!.km < s!.currentKm);
});
