import test from "node:test";
import assert from "node:assert/strict";
import {
  notificationEventLabel,
  notificationPayloadTripId,
  notificationTimelineTitle
} from "../src/lib/trips/timeline-notification.ts";

test("notificationPayloadTripId reads camel and snake case", () => {
  assert.equal(notificationPayloadTripId({ tripId: "t1" }), "t1");
  assert.equal(notificationPayloadTripId({ trip_id: "t2" }), "t2");
  assert.equal(notificationPayloadTripId({ tripId: "" }), null);
});

test("notificationTimelineTitle builds stable label", () => {
  assert.equal(
    notificationTimelineTitle({ eventType: "trip.dispatched", channel: "push" }, "queued"),
    "Corrida despachada · push · queued"
  );
});

test("notificationEventLabel maps driver no-show push", () => {
  assert.equal(notificationEventLabel("trip.no_show"), "No-show registrado");
});
