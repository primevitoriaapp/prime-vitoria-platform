import test from "node:test";
import assert from "node:assert/strict";
import { isCronSecretAuthorized } from "../src/lib/security/cron-auth.ts";

test("cron auth false when secret unset", () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  const req = new Request("http://localhost/api/cron/notifications");
  assert.equal(isCronSecretAuthorized(req), false);
  if (prev) process.env.CRON_SECRET = prev;
});

test("cron auth true when bearer matches", () => {
  process.env.CRON_SECRET = "test-cron-secret-min-16";
  const req = new Request("http://localhost/api/cron/notifications", {
    headers: { authorization: "Bearer test-cron-secret-min-16" }
  });
  assert.equal(isCronSecretAuthorized(req), true);
});
