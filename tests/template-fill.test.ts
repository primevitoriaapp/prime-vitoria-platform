import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTemplate } from "../src/lib/contracts/template-fill.ts";

test("modelo da ZapSign: preenche pelas variáveis conhecidas, deixa vazio o que não sabe", () => {
  const out = fillTemplate(["{{NOME_COMPLETO}}", "{{ CPF }}", "{{Endereço}}", "{{TESTEMUNHA1_NOME}}", "{{PLACA}}"], {
    NOME: "Marcos Souto",
    CPF: "123.456.789-00",
    ENDERECO: "Rua A, 1",
    PLACA: "ABC1D23"
  });
  assert.deepEqual(out.map((o) => o.value), ["Marcos Souto", "123.456.789-00", "Rua A, 1", "", "ABC1D23"]);
});
