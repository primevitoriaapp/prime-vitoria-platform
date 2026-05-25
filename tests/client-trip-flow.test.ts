import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_TRIP_FLOW,
  clientFlowIndex,
  clientFlowSupportsTimeline
} from "../src/lib/client/client-trip-flow.ts";

test("CLIENT_TRIP_FLOW includes requested through completed", () => {
  assert.deepEqual(CLIENT_TRIP_FLOW.slice(0, 2), ["requested", "approved"]);
  assert.equal(CLIENT_TRIP_FLOW.at(-1), "completed");
});

test("clientFlowIndex and supportsTimeline", () => {
  assert.equal(clientFlowIndex("dispatched"), 2);
  assert.equal(clientFlowSupportsTimeline("dispatched"), true);
  assert.equal(clientFlowIndex("cancelled"), -1);
  assert.equal(clientFlowSupportsTimeline("cancelled"), false);
});
