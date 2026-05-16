import test from "node:test";
import assert from "node:assert/strict";
import {
  driverOperationalStatusForTrip,
  isDriverOperationalStatus
} from "../src/lib/drivers/operational-status.ts";

test("driverOperationalStatusForTrip maps active trip statuses", () => {
  assert.equal(driverOperationalStatusForTrip("dispatched"), "ocupado");
  assert.equal(driverOperationalStatusForTrip("accepted"), "ocupado");
  assert.equal(driverOperationalStatusForTrip("on_the_way"), "deslocando");
  assert.equal(driverOperationalStatusForTrip("arrived"), "no_local");
  assert.equal(driverOperationalStatusForTrip("in_progress"), "em_atendimento");
});

test("driverOperationalStatusForTrip returns online for terminal trip statuses", () => {
  assert.equal(driverOperationalStatusForTrip("completed"), "online");
  assert.equal(driverOperationalStatusForTrip("cancelled"), "online");
  assert.equal(driverOperationalStatusForTrip("no_show"), "online");
});

test("isDriverOperationalStatus accepts only known values", () => {
  assert.equal(isDriverOperationalStatus("online"), true);
  assert.equal(isDriverOperationalStatus("offline"), true);
  assert.equal(isDriverOperationalStatus("busy"), false);
});
