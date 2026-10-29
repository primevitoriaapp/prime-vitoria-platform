import { test } from "node:test";
import assert from "node:assert/strict";
import { odometerDistance, parseOdometer } from "../src/lib/trips/odometer.ts";

test("parseOdometer formatos brasileiros", () => {
  assert.equal(parseOdometer("45.230"), 45230);
  assert.equal(parseOdometer("45230"), 45230);
  assert.equal(parseOdometer("45230,5"), 45230.5);
  assert.equal(parseOdometer("45.230,5 km"), 45230.5);
  assert.equal(parseOdometer("12.5"), 12.5);
  assert.equal(parseOdometer("abc"), null);
  assert.equal(parseOdometer(""), null);
});

test("odometerDistance valida", () => {
  assert.deepEqual(odometerDistance(45230, 45262.4), { ok: true, km: 32.4 });
  assert.equal(odometerDistance(45230, 45200).ok, false);
  assert.equal(odometerDistance(null, 10).ok, false);
  assert.equal(odometerDistance(1000, 5000).ok, false);
});
