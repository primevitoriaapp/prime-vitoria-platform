import test from "node:test";
import assert from "node:assert/strict";
import {
  isOperationalTripStatusEvent,
  operationalTripStatusEventType
} from "../src/lib/notifications/operational-status-event.ts";

test("operationalTripStatusEventType maps staff status notifications", () => {
  assert.equal(operationalTripStatusEventType("cancelled"), "operations.trip_cancelled");
  assert.equal(operationalTripStatusEventType("on_the_way"), "operations.trip_on_the_way");
  assert.equal(operationalTripStatusEventType("arrived"), "operations.trip_arrived");
  assert.equal(operationalTripStatusEventType("no_show"), "operations.trip_no_show");
});

test("isOperationalTripStatusEvent limits staff status notifications", () => {
  assert.equal(isOperationalTripStatusEvent("no_show"), true);
  assert.equal(isOperationalTripStatusEvent("completed"), false);
  assert.equal(isOperationalTripStatusEvent("approved"), false);
});
