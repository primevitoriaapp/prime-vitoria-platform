import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../src/lib/integrations/webhook-auth.ts";

test("verifyWebhookSignature accepts valid hmac", () => {
  const secret = "test-webhook-secret-key";
  const body = '{"event":"ping"}';
  const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  assert.equal(verifyWebhookSignature(body, `sha256=${sig}`, secret), true);
});

test("verifyWebhookSignature rejects wrong secret", () => {
  const body = "{}";
  const sig = createHmac("sha256", "a").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, sig, "b"), false);
});
