import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialTripApprovalFields,
  initialTripApprovalFieldsForSession,
  initialTripOperationalStatus,
  initialTripOperationalStatusForSession
} from "../src/lib/trips/initial-trip-status.ts";
import type { SessionContext } from "../src/lib/domain/types.ts";

test("cliente cria corrida como requested", () => {
  assert.equal(initialTripOperationalStatus("cliente"), "requested");
  assert.deepEqual(initialTripApprovalFields("cliente", "user-1"), {});
});

test("admin e operador criam corrida como approved", () => {
  assert.equal(initialTripOperationalStatus("admin"), "approved");
  assert.equal(initialTripOperationalStatus("operador"), "approved");
  const fields = initialTripApprovalFields("admin", "user-1");
  assert.equal(fields.approved_by, "user-1");
  assert.ok(fields.approved_at);
});

test("sessão portal (trip.request) cria como requested", () => {
  const session: SessionContext = {
    userId: "u1",
    role: "cliente",
    clientId: "c1"
  };
  assert.equal(initialTripOperationalStatusForSession(session), "requested");
  assert.deepEqual(initialTripApprovalFieldsForSession(session, "u1"), {});
});

test("sessão operador (trip.write) cria como approved", () => {
  const session: SessionContext = {
    userId: "u1",
    role: "operador"
  };
  assert.equal(initialTripOperationalStatusForSession(session), "approved");
  const fields = initialTripApprovalFieldsForSession(session, "u1");
  assert.equal(fields.approved_by, "u1");
  assert.ok(fields.approved_at);
});
