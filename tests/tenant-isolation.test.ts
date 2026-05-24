import test from "node:test";
import assert from "node:assert/strict";
import { capabilitiesForRole } from "../src/lib/security/capabilities.ts";

const TENANT_A = "a0000000-0000-0000-0000-000000000001";
const TENANT_B = "b0000000-0000-0000-0000-000000000002";

test("capabilitiesForRole: operador cannot get finance.write", () => {
  const caps = capabilitiesForRole("operador");
  assert.ok(!caps.includes("finance.write"));
  assert.ok(caps.includes("trip.write"));
});

test("capabilitiesForRole: financeiro isolated from dispatch", () => {
  const caps = capabilitiesForRole("financeiro");
  assert.ok(!caps.includes("dispatch"));
  assert.ok(caps.includes("finance.read"));
});

test("capabilitiesForRole: motorista only assigned trip access", () => {
  const caps = capabilitiesForRole("motorista");
  assert.ok(caps.includes("trip.read.assigned"));
  assert.ok(!caps.includes("trip.read"));
});

test("capabilitiesForRole: admin has wildcard", () => {
  assert.deepEqual(capabilitiesForRole("admin"), ["*"]);
});

test("capabilitiesForRole: guest has no capabilities", () => {
  assert.equal(capabilitiesForRole("guest").length, 0);
});

test("tenant ids are distinct in isolation fixtures", () => {
  assert.notEqual(TENANT_A, TENANT_B);
});
