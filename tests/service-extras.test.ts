import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanServiceExtras, presentationAtIso, serviceExtrasLabel } from "../src/lib/trips/service-extras.ts";

test("limpa marcações desconhecidas e repetidas", () => {
  assert.deepEqual(cleanServiceExtras(["agua", "xpto", "agua", "placa_nome"]), ["agua", "placa_nome"]);
  assert.deepEqual(cleanServiceExtras("agua"), []);
});

test("rótulo das marcações", () => {
  assert.equal(serviceExtrasLabel(["agua", "placa_nome"]), "Placa com o nome, Água a bordo");
  assert.equal(serviceExtrasLabel([]), "");
});

test("horário de apresentação", () => {
  assert.equal(presentationAtIso("2026-10-29T13:00:00.000Z", 15), "2026-10-29T12:45:00.000Z");
  assert.equal(presentationAtIso("2026-10-29T13:00:00.000Z", 0), null);
});
