import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveDriverAuthPassword,
  hashDriverPin,
  isValidDriverPin,
  verifyDriverPin
} from "../src/lib/auth/driver-pin-crypto.ts";

test("isValidDriverPin accepts only 4 digits", () => {
  assert.equal(isValidDriverPin("1234"), true);
  assert.equal(isValidDriverPin("123"), false);
  assert.equal(isValidDriverPin("12345"), false);
  assert.equal(isValidDriverPin("12a4"), false);
});

test("hashDriverPin and verifyDriverPin round-trip", () => {
  const stored = hashDriverPin("4821");
  assert.ok(stored.startsWith("scrypt:"));
  assert.equal(verifyDriverPin("4821", stored), true);
  assert.equal(verifyDriverPin("0000", stored), false);
});

test("deriveDriverAuthPassword is stable per driver id", () => {
  const a = deriveDriverAuthPassword("a0000000-0000-0000-0000-000000000099");
  const b = deriveDriverAuthPassword("a0000000-0000-0000-0000-000000000099");
  const c = deriveDriverAuthPassword("b0000000-0000-0000-0000-000000000099");
  assert.equal(a, b);
  assert.notEqual(a, c);
});
