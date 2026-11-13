import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSENGER_TEMPLATES, renderPassengerTemplate, dayPhrase, confirmSendAt } from "../src/lib/messages/passenger-whatsapp-templates.ts";

test("modelos têm nome válido para a Meta e exemplos para cada variável", () => {
  for (const t of PASSENGER_TEMPLATES) {
    assert.match(t.name, /^[a-z0-9_]+$/);
    const vars = new Set([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
    assert.equal(vars.size, t.example.length, t.name);
  }
});

test("prévia preenche as variáveis", () => {
  const txt = renderPassengerTemplate("confirmado", ["Catarina", "amanhã (14/11)", "19:00", "João", "Onix preto", "ABC1D23"]);
  assert.match(txt, /Olá, Catarina!/);
  assert.match(txt, /placa ABC1D23/);
  assert.doesNotMatch(txt, /\{\{/);
});

test("véspera às 18h de Vitória", () => {
  assert.equal(confirmSendAt("2026-11-14T22:00:00Z").toISOString(), "2026-11-13T21:00:00.000Z");
  assert.equal(dayPhrase("2026-11-14T22:00:00Z", new Date("2026-11-13T21:00:00Z")), "amanhã (14/11)");
  assert.equal(dayPhrase("2026-11-13T22:00:00Z", new Date("2026-11-13T12:00:00Z")), "hoje");
});
