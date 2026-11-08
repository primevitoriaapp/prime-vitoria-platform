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

test("modelo PF real da Prime: veículo marca/modelo", async () => {
  const { fillTemplate } = await import("../src/lib/contracts/template-fill.ts");
  const out = fillTemplate(["{{VEICULO_MARCA_MODELO}}", "{{VEICULO_PLACA}}", "{{VEICULO_ANO}}", "{{CNH_VALIDADE}}"], { VEICULO: "Toyota Yaris", PLACA: "XYZ9A99", ANO: "2025", CNH_VALIDADE: "01/02/2030" });
  assert.deepEqual(out.map((o) => o.value), ["Toyota Yaris", "XYZ9A99", "2025", "01/02/2030"]);
});
