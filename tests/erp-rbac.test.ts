import test from "node:test";
import assert from "node:assert/strict";
import { can } from "../src/lib/security/rbac.ts";
import type { SessionContext } from "../src/lib/domain/types.ts";

function session(role: SessionContext["role"], extra: Partial<SessionContext> = {}): SessionContext {
  return { userId: "u1", role, ...extra };
}

test("operador can write ERP mappings", () => {
  assert.equal(can(session("operador"), "erp.mapping.write"), true);
  assert.equal(can(session("operador"), "erp.mapping.read"), true);
});

test("financeiro can read ERP mappings but not write", () => {
  assert.equal(can(session("financeiro"), "erp.mapping.read"), true);
  assert.equal(can(session("financeiro"), "erp.mapping.write"), false);
});

test("cliente cannot access ERP mappings", () => {
  assert.equal(can(session("cliente"), "erp.mapping.read"), false);
});

test("financeiro can enqueue ERP jobs", () => {
  assert.equal(can(session("financeiro"), "erp.jobs.enqueue"), true);
});

test("admin wildcard includes ERP jobs", () => {
  assert.equal(can(session("admin"), "erp.jobs.enqueue"), true);
});

test("operador can enqueue ERP jobs", () => {
  assert.equal(can(session("operador"), "erp.jobs.enqueue"), true);
});

test("operador can process ERP job queue", () => {
  assert.equal(can(session("operador"), "erp.jobs.process"), true);
});

test("financeiro cannot process ERP job queue (only enqueue)", () => {
  assert.equal(can(session("financeiro"), "erp.jobs.process"), false);
});

test("operador can run notification job processor", () => {
  assert.equal(can(session("operador"), "jobs.notifications.process"), true);
});

test("financeiro cannot run notification job processor", () => {
  assert.equal(can(session("financeiro"), "jobs.notifications.process"), false);
});

test("financeiro can run reconciliation job", () => {
  assert.equal(can(session("financeiro"), "jobs.reconcile.run"), true);
});

test("cliente cannot run reconciliation job", () => {
  assert.equal(can(session("cliente"), "jobs.reconcile.run"), false);
});

test("operador can manage clients and vehicles", () => {
  assert.equal(can(session("operador"), "client.read"), true);
  assert.equal(can(session("operador"), "client.write"), true);
  assert.equal(can(session("operador"), "vehicle.read"), true);
  assert.equal(can(session("operador"), "vehicle.write"), true);
});

test("cliente cannot list or create clients", () => {
  assert.equal(can(session("cliente"), "client.read"), false);
  assert.equal(can(session("cliente"), "client.write"), false);
});

test("motorista can post location capability", () => {
  assert.equal(can(session("motorista"), "location.write"), true);
});

test("motorista can read own payables and upload proof", () => {
  assert.equal(can(session("motorista"), "finance.payable.read.own"), true);
  assert.equal(can(session("motorista"), "finance.payable.proof.own"), true);
  assert.equal(can(session("motorista"), "finance.read"), false);
});

test("operador can post driver locations for operations", () => {
  assert.equal(can(session("operador"), "location.write"), true);
});

test("cliente uses trip.read.own not global trip.read", () => {
  assert.equal(can(session("cliente"), "trip.read"), false);
  assert.equal(can(session("cliente"), "trip.read.own"), true);
});

test("motorista uses trip.read.assigned", () => {
  assert.equal(can(session("motorista"), "trip.read"), false);
  assert.equal(can(session("motorista"), "trip.read.assigned"), true);
});

test("financeiro can read trips for consoles", () => {
  assert.equal(can(session("financeiro"), "trip.read"), true);
});

test("operador can list profiles for tenant user management", () => {
  assert.equal(can(session("operador"), "profiles.read"), true);
});

test("financeiro cannot list profiles", () => {
  assert.equal(can(session("financeiro"), "profiles.read"), false);
});

test("admin can list profiles via wildcard", () => {
  assert.equal(can(session("admin"), "profiles.read"), true);
});
