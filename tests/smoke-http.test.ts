import test from "node:test";
import assert from "node:assert/strict";
import {
  isVercelProtectionResponse,
  vercelProtectionMessage
} from "../src/lib/deploy/smoke-http.mjs";

test("isVercelProtectionResponse detects Vercel login redirects", () => {
  assert.equal(
    isVercelProtectionResponse({
      responseUrl: "https://vercel.com/login?next=https%3A%2F%2Fpreview.vercel.app%2Fapi%2Fhealth",
      body: "<html>Log in to Vercel</html>"
    }),
    true
  );
});

test("isVercelProtectionResponse ignores normal API responses", () => {
  assert.equal(
    isVercelProtectionResponse({
      responseUrl: "https://preview.vercel.app/api/health",
      body: '{"ok":true}'
    }),
    false
  );
});

test("vercelProtectionMessage explains how to unblock smoke", () => {
  const message = vercelProtectionMessage(
    "health",
    "https://preview.vercel.app/api/health",
    "https://vercel.com/login"
  );

  assert.match(message, /Vercel Deployment Protection/);
  assert.match(message, /public alias/);
});
