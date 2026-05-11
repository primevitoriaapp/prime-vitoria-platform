import test from "node:test";
import assert from "node:assert/strict";
import { isMachineBearerAuthorized } from "../src/lib/security/machine-bearer-auth.ts";

test("machine bearer false when secret undefined", () => {
  const req = new Request("https://example.com", {
    headers: { authorization: "Bearer x" }
  });
  assert.equal(isMachineBearerAuthorized(req, undefined), false);
});

test("machine bearer true when bearer matches trimmed secret", () => {
  const req = new Request("https://example.com", {
    headers: { authorization: "Bearer hello-secret" }
  });
  assert.equal(isMachineBearerAuthorized(req, "  hello-secret  "), true);
});

test("machine bearer false on length or value mismatch", () => {
  const req = new Request("https://example.com", {
    headers: { authorization: "Bearer aab" }
  });
  assert.equal(isMachineBearerAuthorized(req, "aaa"), false);
  assert.equal(isMachineBearerAuthorized(new Request("https://example.com"), "z"), false);
});
