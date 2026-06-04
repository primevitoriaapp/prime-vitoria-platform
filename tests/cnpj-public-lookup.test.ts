import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidCnpj,
  mapBrasilApiCnpjPayload
} from "../src/lib/integrations/cnpj-public-lookup.ts";

test("isValidCnpj aceita CNPJ conhecido válido", () => {
  assert.equal(isValidCnpj("00000000000191"), true);
});

test("isValidCnpj rejeita sequência repetida", () => {
  assert.equal(isValidCnpj("11111111111111"), false);
});

test("isValidCnpj rejeita dígitos verificadores errados", () => {
  assert.equal(isValidCnpj("00000000000190"), false);
});

test("mapBrasilApiCnpjPayload mapeia campos principais", () => {
  const mapped = mapBrasilApiCnpjPayload(
    {
      cnpj: "00000000000191",
      razao_social: "EMPRESA TESTE LTDA",
      nome_fantasia: "Empresa Teste",
      logradouro: "Rua A",
      numero: "100",
      bairro: "Centro",
      municipio: "Vitória",
      uf: "es",
      cep: "29010000",
      descricao_situacao_cadastral: "ATIVA",
      cnae_fiscal_descricao: "Transporte executivo"
    },
    "00000000000191"
  );

  assert.equal(mapped.legal_name, "EMPRESA TESTE LTDA");
  assert.equal(mapped.trade_name, "Empresa Teste");
  assert.equal(mapped.city, "Vitória");
  assert.equal(mapped.state, "ES");
  assert.equal(mapped.postal_code, "29010000");
  assert.match(mapped.address_line ?? "", /Rua A/);
  assert.equal(mapped.registry_status, "ATIVA");
});
