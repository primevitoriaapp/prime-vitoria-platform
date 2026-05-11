import test from "node:test";
import assert from "node:assert/strict";
import { getClientIp, assertIntegrationIpAllowed } from "../src/lib/security/integration-guard.ts";

test("getClientIp reads first x-forwarded-for", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" }
  });
  assert.equal(getClientIp(req), "203.0.113.1");
});

test("getClientIp falls back to x-real-ip", () => {
  const req = new Request("https://example.com", {
    headers: { "x-real-ip": "198.51.100.2" }
  });
  assert.equal(getClientIp(req), "198.51.100.2");
});

test("assertIntegrationIpAllowed no-op when env unset", () => {
  const prev = process.env.ERP_INTEGRATION_ALLOWED_IPS;
  delete process.env.ERP_INTEGRATION_ALLOWED_IPS;
  try {
    const req = new Request("https://example.com");
    assertIntegrationIpAllowed(req);
  } finally {
    if (prev !== undefined) process.env.ERP_INTEGRATION_ALLOWED_IPS = prev;
  }
});

test("assertIntegrationIpAllowed rejects when IP not in list", () => {
  const prev = process.env.ERP_INTEGRATION_ALLOWED_IPS;
  process.env.ERP_INTEGRATION_ALLOWED_IPS = "203.0.113.10";
  try {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "198.51.100.9" }
    });
    assert.throws(() => assertIntegrationIpAllowed(req), /Integration access denied/);
  } finally {
    if (prev !== undefined) process.env.ERP_INTEGRATION_ALLOWED_IPS = prev;
    else delete process.env.ERP_INTEGRATION_ALLOWED_IPS;
  }
});
