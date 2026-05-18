import test from "node:test";
import assert from "node:assert/strict";
import {
  driverDispatchedPushPayload,
  driverStatusPushEventType,
  driverStatusPushPresentation
} from "../src/lib/notifications/driver-status-event.ts";

test("driverStatusPushEventType on key transitions", () => {
  assert.equal(driverStatusPushEventType("completed", "in_progress", "d1"), "trip.completed");
  assert.equal(driverStatusPushEventType("cancelled", "dispatched", "d1"), "trip.cancelled");
  assert.equal(driverStatusPushEventType("no_show", "arrived", "d1"), "trip.no_show");
  assert.equal(driverStatusPushEventType("dispatched", "approved", "d1"), "trip.dispatched");
  assert.equal(driverStatusPushEventType("dispatched", "dispatched", "d1"), null);
  assert.equal(driverStatusPushEventType("completed", "in_progress", null), null);
});

test("driverStatusPushPresentation gives friendly driver push text", () => {
  assert.deepEqual(driverStatusPushPresentation("trip.no_show", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), {
    title: "No-show registrado",
    body: "Corrida aaaaaaaa... marcada como no-show."
  });
  assert.equal(driverStatusPushPresentation("unknown", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").title, "Atualização de corrida");
});

test("driverDispatchedPushPayload uses friendly canonical dispatch event", () => {
  assert.deepEqual(driverDispatchedPushPayload("driver-1", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), {
    eventType: "trip.dispatched",
    channel: "push",
    recipientType: "driver",
    recipientId: "driver-1",
    tripId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    title: "Nova corrida atribuída",
    body: "Corrida aaaaaaaa... disponível no painel do motorista."
  });
});
