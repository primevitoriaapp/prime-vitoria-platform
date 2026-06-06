import test from "node:test";
import assert from "node:assert/strict";
import {
  asUserRole,
  resolveEffectiveUserRole,
  roleFromJwtClaims,
  roleFromProfileField
} from "../src/lib/auth/role-from-claims.ts";

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

test("roleFromProfileField reconhece client_admin como cliente", () => {
  assert.equal(roleFromProfileField("client_admin"), "cliente");
  assert.equal(roleFromProfileField("cliente"), "cliente");
});

test("profile client_id prevalece sobre user_metadata admin", () => {
  const role = resolveEffectiveUserRole({
    user: { id: "user-1", user_metadata: { role: "admin" }, app_metadata: {}, aud: "authenticated", created_at: "" },
    profileRole: null,
    profileClientId: "client-uuid",
    driverId: null
  });
  assert.equal(role, "cliente");
});

test("profile client_admin mapeia para cliente", () => {
  const role = resolveEffectiveUserRole({
    user: { id: "user-1", user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "" },
    profileRole: "client_admin",
    profileClientId: "client-uuid",
    driverId: null
  });
  assert.equal(role, "cliente");
});
