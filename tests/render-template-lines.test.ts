import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "../src/lib/messages/templates.ts";

test("linha só com variável vazia some", () => {
  const out = renderTemplate("Olá {nome}\n✈️ {voo}\n📝 {observacoes}{linha}\n👉 {link}", { nome: "Ana", voo: "", observacoes: "", link: "x" });
  assert.equal(out, "Olá Ana\n👉 x");
});

test("rótulo com variável vazia some; texto fixo fica", () => {
  const out = renderTemplate("Passageiro: {p}\nBoa viagem!", { p: "" });
  assert.equal(out, "Boa viagem!");
});

test("variável preenchida mantém a linha", () => {
  assert.equal(renderTemplate("✈️ {voo}", { voo: "Voo LA1" }), "✈️ Voo LA1");
});
