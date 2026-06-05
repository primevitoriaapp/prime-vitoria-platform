import assert from "node:assert/strict";
import { postLoginPathForRole } from "../src/lib/auth/post-login-path.ts";

assert.equal(postLoginPathForRole("motorista"), "/driver");
assert.equal(postLoginPathForRole("cliente"), "/client");
assert.equal(postLoginPathForRole("operador"), "/dashboard");

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://") || path.includes("@")) return false;
  return path.length < 512;
}

assert.equal(isSafeInternalPath("/driver"), true);
assert.equal(isSafeInternalPath("https://vercel.com/404"), false);
assert.equal(isSafeInternalPath("//evil.com"), false);

console.log("login-redirect.test.ts OK");
