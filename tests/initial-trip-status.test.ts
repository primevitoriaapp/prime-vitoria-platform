import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialTripApprovalFields,
  initialTripOperationalStatus
} from "../src/lib/trips/initial-trip-status.ts";

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
