import test from "node:test";
import assert from "node:assert/strict";
import { trustHeaderAuth } from "../src/lib/server/trust-header-auth.ts";

test("production without flag does not trust headers", () => {
  assert.equal(trustHeaderAuth({ NODE_ENV: "production", TRUST_HEADER_AUTH: undefined }), false);
});

test("production with TRUST_HEADER_AUTH=true trusts headers", () => {
  assert.equal(trustHeaderAuth({ NODE_ENV: "production", TRUST_HEADER_AUTH: "true" }), true);
});

test("development trusts headers by default", () => {
  assert.equal(trustHeaderAuth({ NODE_ENV: "development", TRUST_HEADER_AUTH: undefined }), true);
});

test("test env trusts headers by default (local CI)", () => {
  assert.equal(trustHeaderAuth({ NODE_ENV: "test", TRUST_HEADER_AUTH: undefined }), true);
});
