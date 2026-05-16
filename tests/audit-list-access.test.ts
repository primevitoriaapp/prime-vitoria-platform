import test from "node:test";
import assert from "node:assert/strict";
import { canListAuditEvents } from "../src/lib/security/audit-list-access.ts";

test("canListAuditEvents allows admin operador financeiro", () => {
  assert.equal(canListAuditEvents("admin"), true);
  assert.equal(canListAuditEvents("operador"), true);
  assert.equal(canListAuditEvents("financeiro"), true);
});

test("canListAuditEvents denies others", () => {
  assert.equal(canListAuditEvents("motorista"), false);
  assert.equal(canListAuditEvents("cliente"), false);
  assert.equal(canListAuditEvents("guest"), false);
});
