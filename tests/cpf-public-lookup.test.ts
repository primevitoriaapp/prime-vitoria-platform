import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidCpf } from "../src/lib/integrations/cpf-public-lookup.ts";

test("isValidCpf aceita CPF conhecido válido", () => {
  assert.equal(isValidCpf("52998224725"), true);
});

test("isValidCpf rejeita sequência repetida", () => {
  assert.equal(isValidCpf("11111111111"), false);
});

test("isValidCpf rejeita dígitos verificadores errados", () => {
  assert.equal(isValidCpf("52998224724"), false);
});
