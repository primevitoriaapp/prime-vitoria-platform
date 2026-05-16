import test from "node:test";
import assert from "node:assert/strict";
import { presentInAppNotification } from "../src/lib/notifications/in-app-present.ts";

test("presentInAppNotification trip.completed", () => {
  const view = presentInAppNotification({
    id: "n1",
    event_type: "trip.completed",
    payload: { tripId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
    status: "sent",
    sent_at: "2026-01-01T12:00:00Z",
    read_at: null,
    created_at: "2026-01-01T12:00:00Z"
  });
  assert.equal(view.title, "Corrida concluída");
  assert.equal(view.unread, true);
  assert.equal(view.tripId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

test("presentInAppNotification operations.trip_approved", () => {
  const view = presentInAppNotification({
    id: "n3",
    event_type: "operations.trip_approved",
    payload: { tripId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
    status: "sent",
    sent_at: null,
    read_at: null,
    created_at: "2026-01-01T12:00:00Z"
  });
  assert.equal(view.title, "Corrida aprovada");
  assert.match(view.body, /pronta para despacho/i);
});

test("presentInAppNotification operations.trip_claimed", () => {
  const view = presentInAppNotification({
    id: "n4",
    event_type: "operations.trip_claimed",
    payload: { tripId: "t1", claimer_name: "Maria" },
    status: "sent",
    sent_at: null,
    read_at: null,
    created_at: "2026-01-01T12:00:00Z"
  });
  assert.match(view.body, /Maria/);
});

test("presentInAppNotification operations.trip_dispatched directed", () => {
  const tid = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const view = presentInAppNotification({
    id: "n6",
    event_type: "operations.trip_dispatched",
    payload: { tripId: tid, driver_id: "d1", dispatch_mode: "directed" },
    status: "sent",
    sent_at: null,
    read_at: null,
    created_at: "2026-01-01T12:00:00Z"
  });
  assert.equal(view.title, "Corrida despachada");
  assert.match(view.body, /despacho directo/);
  assert.equal(view.tripId, tid);
});

test("presentInAppNotification operations.trip_dispatched offer", () => {
  const view = presentInAppNotification({
    id: "n7",
    event_type: "operations.trip_dispatched",
    payload: { tripId: "eee", dispatch_mode: "offer" },
    status: "sent",
    sent_at: null,
    read_at: null,
    created_at: "2026-01-01T12:00:00Z"
  });
  assert.match(view.body, /via oferta/);
});

test("presentInAppNotification operations.trip_reassigned", () => {
  const tid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const view = presentInAppNotification({
    id: "n8",
    event_type: "operations.trip_reassigned",
    payload: { tripId: tid, new_driver_id: "n1", previous_driver_id: "p1" },
    status: "sent",
    sent_at: null,
    read_at: null,
    created_at: "2026-01-01T12:00:00Z"
  });
  assert.equal(view.title, "Corrida reatribuída");
  assert.equal(view.tripId, tid);
});

test("presentInAppNotification finance.driver_payable_open", () => {
  const view = presentInAppNotification({
    id: "n2",
    event_type: "finance.driver_payable_open",
    payload: { amount: 150.5, tripId: "t1" },
    status: "sent",
    sent_at: null,
    read_at: "2026-01-02T00:00:00Z",
    created_at: "2026-01-01T12:00:00Z"
  });
  assert.match(view.body, /150\.50/);
  assert.equal(view.unread, false);
});

test("presentInAppNotification finance.accounts_receivable_open", () => {
  const tid = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const view = presentInAppNotification({
    id: "n5",
    event_type: "finance.accounts_receivable_open",
    payload: { tripId: tid, receivable_id: "r1" },
    status: "sent",
    sent_at: null,
    read_at: null,
    created_at: "2026-01-01T12:00:00Z"
  });
  assert.equal(view.title, "Conta a receber gerada");
  assert.match(view.body, /pós-corrida/i);
  assert.equal(view.tripId, tid);
});
