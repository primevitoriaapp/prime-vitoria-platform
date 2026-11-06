import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeamRows, parseCategories, parseYes } from "../src/lib/import/team-import.ts";

const cats = [
  { id: "a", name: "Prime Essencial" },
  { id: "b", name: "Prime Executivo" },
  { id: "c", name: "Prime Premium" }
];

test("sim/não", () => {
  assert.equal(parseYes("Sim"), true);
  assert.equal(parseYes(""), true);
  assert.equal(parseYes("Não"), false);
});

test("categorias", () => {
  assert.deepEqual(parseCategories("todas", cats).ids, null);
  assert.deepEqual(parseCategories("Prime Essencial", cats).ids, ["a"]);
  assert.deepEqual(parseCategories("essencial, executivo", cats).ids, ["a", "b"]);
  assert.deepEqual(parseCategories("Helicóptero", cats).unknown, ["Helicóptero"]);
});

test("planilha", () => {
  const t = [
    ["Nome", "CPF", "E-mail", "Endereço", "Pode pedir corrida", "Categorias permitidas"],
    ["Alan", "529.982.247-25", "alan@x.com", "Rua A, 1", "sim", "todas"],
    ["Gustavo", "", "gustavo@x.com", "Rua B, 2", "sim", "Prime Essencial"],
    ["", "", "", "", "", ""],
    ["X", "", "", "", "", ""]
  ];
  const { rows } = buildTeamRows(t, cats, { cpfs: new Set(), emails: new Set(["gustavo@x.com"]) });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].data.allowed_category_ids, null);
  assert.deepEqual(rows[1].data.allowed_category_ids, ["a"]);
  assert.ok(rows[1].warnings.some((w) => w.includes("já cadastrado")));
  assert.ok(rows[2].errors.includes("sem nome"));
});

test("modelo baixado: linhas de exemplo não são importadas; linha real entra", async () => {
  const { buildTeamRows, teamTemplateCsv } = await import("../src/lib/import/team-import.ts");
  const { parseCsv } = await import("../src/lib/import/sheet-import.ts");
  const cats = [{ id: "11111111-1111-4111-8111-111111111111", name: "Prime Essencial" }];
  const csv = teamTemplateCsv(["Prime Essencial"]) + '\n"Maria Silva";"";"maria@cliente.com.br";"27999990000";"Rua A, 1 - Vitória/ES";"";"RH";"";"sim";"Prime Essencial"';
  const { rows } = buildTeamRows(parseCsv(csv), cats, { cpfs: new Set(), emails: new Set() });
  assert.equal(rows.length, 3);
  assert.ok(rows[0].errors.length && rows[1].errors.length, "exemplos bloqueados");
  assert.deepEqual(rows[2].errors, []);
  assert.equal(rows[2].data.name, "Maria Silva");
  assert.deepEqual(rows[2].data.allowed_category_ids, ["11111111-1111-4111-8111-111111111111"]);
});
