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
