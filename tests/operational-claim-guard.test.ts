import test from "node:test";
import assert from "node:assert/strict";

/** Lógica espelhada do início de assertOperationalClaimForAction (sem I/O). */
function shouldSkipClaimEnforcement(role: string, requireClaim: boolean): boolean {
  if (role === "admin") return true;
  if (!requireClaim) return true;
  if (role !== "operador") return true;
  return false;
}

test("admin always skips claim enforcement", () => {
  assert.equal(shouldSkipClaimEnforcement("admin", true), true);
});

test("operador enforces when require_operational_claim", () => {
  assert.equal(shouldSkipClaimEnforcement("operador", true), false);
});

test("operador skips when setting off", () => {
  assert.equal(shouldSkipClaimEnforcement("operador", false), true);
});

test("financeiro skips claim enforcement", () => {
  assert.equal(shouldSkipClaimEnforcement("financeiro", true), true);
});
