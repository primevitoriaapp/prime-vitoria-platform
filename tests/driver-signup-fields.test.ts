import { test } from "node:test";
import assert from "node:assert/strict";
import { validCpf, SIGNUP_FILE_KINDS } from "../src/lib/drivers/driver-signup-fields.ts";

test("valida CPF", () => {
  assert.equal(validCpf("529.982.247-25"), true);
  assert.equal(validCpf("111.111.111-11"), false);
  assert.equal(validCpf("529.982.247-24"), false);
  assert.equal(validCpf("123"), false);
});

test("tipos de arquivo conhecidos", () => {
  assert.ok(SIGNUP_FILE_KINDS.has("cnh"));
  assert.ok(!SIGNUP_FILE_KINDS.has("qualquer"));
});
