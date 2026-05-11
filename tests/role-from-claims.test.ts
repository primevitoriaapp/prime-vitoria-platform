import test from "node:test";
import assert from "node:assert/strict";
import { asUserRole, roleFromJwtClaims } from "../src/lib/auth/role-from-claims.ts";

test("asUserRole accepts operational roles", () => {
  assert.equal(asUserRole("operador"), "operador");
  assert.equal(asUserRole("guest"), null);
  assert.equal(asUserRole("nope"), null);
});

test("roleFromJwtClaims prefers app_metadata over user_metadata", () => {
  assert.equal(
    roleFromJwtClaims({
      app_metadata: { role: "financeiro" },
      user_metadata: { role: "cliente" }
    }),
    "financeiro"
  );
});

test("roleFromJwtClaims falls back to user_metadata then cliente", () => {
  assert.equal(roleFromJwtClaims({ user_metadata: { role: "motorista" } }), "motorista");
  assert.equal(roleFromJwtClaims({}), "cliente");
});
