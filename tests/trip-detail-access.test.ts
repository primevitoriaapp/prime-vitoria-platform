import test from "node:test";
import assert from "node:assert/strict";
import { denyUnlessTripReadable, tripGetAccess } from "../src/lib/trips/trip-detail-access.ts";
import type { SessionContext } from "../src/lib/domain/types.ts";

function session(role: SessionContext["role"], extra: Partial<SessionContext> = {}): SessionContext {
  return { userId: "u1", role, ...extra };
}

const trip = { client_id: "c1", driver_id: "d1" as string | null };

test("operador with trip.read sees any trip", () => {
  assert.equal(tripGetAccess(session("operador"), trip), "allow");
});

test("cliente sees own client trip only", () => {
  assert.equal(tripGetAccess(session("cliente", { clientId: "c1" }), trip), "allow");
  assert.equal(tripGetAccess(session("cliente", { clientId: "c2" }), trip), "not_found");
});

test("cliente without client scope", () => {
  assert.equal(tripGetAccess(session("cliente"), trip), "scope_required_client");
});

test("guest cannot read trips", () => {
  assert.equal(tripGetAccess(session("guest"), trip), "no_capability");
});

test("motorista sees assigned trip only", () => {
  assert.equal(tripGetAccess(session("motorista", { driverId: "d1" }), trip), "allow");
  assert.equal(tripGetAccess(session("motorista", { driverId: "d2" }), trip), "not_found");
});

test("motorista without driver id", () => {
  assert.equal(tripGetAccess(session("motorista"), trip), "scope_required_driver");
});

test("financeiro has trip.read", () => {
  assert.equal(tripGetAccess(session("financeiro"), trip), "allow");
});

test("denyUnlessTripReadable null only for allow", () => {
  assert.equal(denyUnlessTripReadable("allow"), null);
  assert.ok(denyUnlessTripReadable("not_found"));
  assert.ok(denyUnlessTripReadable("no_capability"));
});

test("operador can open dispatch on any trip (trip.read)", () => {
  assert.equal(tripGetAccess(session("operador"), { client_id: "other", driver_id: null }), "allow");
});
