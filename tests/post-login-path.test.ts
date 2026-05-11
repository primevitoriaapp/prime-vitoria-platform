import test from "node:test";
import assert from "node:assert/strict";
import { postLoginPathForRole } from "../src/lib/auth/post-login-path.ts";

test("postLoginPathForRole maps roles", () => {
  assert.equal(postLoginPathForRole("motorista"), "/driver");
  assert.equal(postLoginPathForRole("cliente"), "/client");
  assert.equal(postLoginPathForRole("financeiro"), "/finance");
  assert.equal(postLoginPathForRole("operador"), "/dashboard");
  assert.equal(postLoginPathForRole("admin"), "/dashboard");
});
