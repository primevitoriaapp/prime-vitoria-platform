import assert from "node:assert/strict";
import { resolveTripTenantId } from "../src/lib/trips/resolve-trip-tenant.ts";

const TENANT_A = "a0000000-0000-0000-0000-000000000001";
const TENANT_B = "b0000000-0000-0000-0000-000000000002";

assert.equal(
  resolveTripTenantId({ userId: "u1", role: "cliente", clientId: "c1" }, TENANT_B, TENANT_A),
  TENANT_B
);

assert.throws(
  () =>
    resolveTripTenantId({ userId: "u1", role: "operador", tenantId: TENANT_A }, TENANT_B, TENANT_A),
  /Forbidden/
);

assert.equal(
  resolveTripTenantId({ userId: "u1", role: "operador", tenantId: TENANT_A }, TENANT_A, TENANT_A),
  TENANT_A
);

console.log("resolve-trip-tenant.test.ts OK");
