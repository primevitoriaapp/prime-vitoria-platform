import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows, mapHeaders, parseCsv, parseDate, validCnpj, validCpf } from "../src/lib/import/sheet-import.ts";

test("reconhece cabeçalhos com acento e caixa diferentes", () => {
  const m = mapHeaders("motoristas", ["NOME", "Cpf", "Validade CNH", "Whats"]);
  assert.deepEqual(m, { full_name: 0, cpf: 1, cnh_expiry: 2, whatsapp: 3 });
});

test("CPF e CNPJ", () => {
  assert.equal(validCpf("529.982.247-25"), true);
  assert.equal(validCpf("111.111.111-11"), false);
  assert.equal(validCnpj("11.222.333/0001-81"), true);
  assert.equal(validCnpj("11.222.333/0001-82"), false);
});

test("datas", () => {
  assert.equal(parseDate("31/12/2027"), "2027-12-31");
  assert.equal(parseDate("2027-12-31"), "2027-12-31");
  assert.equal(parseDate("46752"), "2027-12-31");
  assert.equal(parseDate("amanhã"), null);
});

test("CSV com ponto e vírgula e aspas", () => {
  assert.deepEqual(parseCsv('nome;obs\n"Silva; Cia";"diz ""oi"""\n'), [["nome", "obs"], ["Silva; Cia", 'diz "oi"']]);
});

test("motoristas: inválido, duplicado e tipo", () => {
  const { rows } = buildRows(
    "motoristas",
    [["Nome", "CPF", "Tipo"], ["Ana", "529.982.247-25", "Funcionário"], ["Beto", "123", ""], ["Ana 2", "52998224725", ""]],
    new Set()
  );
  assert.equal(rows[0].data.employment_type, "funcionario");
  assert.deepEqual(rows[1].errors, ["CPF inválido"]);
  assert.equal(rows[2].duplicate, true);
});

test("clientes: PF pelo CPF e duplicado existente", () => {
  const { rows } = buildRows("clientes", [["Nome", "CPF/CNPJ"], ["Maria", "529.982.247-25"], ["Empresa", "11.222.333/0001-81"]], new Set(["11222333000181"]));
  assert.equal(rows[0].data.type, "PF");
  assert.equal(rows[1].duplicate, true);
});
