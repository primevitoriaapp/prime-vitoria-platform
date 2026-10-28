import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultTemplate,
  normalizeWhatsappPhone,
  partnerValueLine,
  renderTemplate,
  whatsappLink
} from "../src/lib/messages/templates.ts";

test("preenche variáveis e remove as vazias sem espaço duplo", () => {
  const out = renderTemplate("Olá, {nome}! Motorista {motorista} {placa}.", { nome: "Ana", motorista: "Carlos" });
  assert.equal(out, "Olá, Ana! Motorista Carlos.");
});

test("OS do funcionário não mostra valor; do parceiro mostra o repasse", () => {
  const body = defaultTemplate("os_motorista", "motorista")!;
  const vars = { numero: "AB12", data: "30/10", horario: "14:00", origem: "Aeroporto", destino: "Centro", passageiro: "Ana" };
  const func = renderTemplate(body, { ...vars, linha_valor_parceiro: partnerValueLine("funcionario", 154) });
  const parc = renderTemplate(body, { ...vars, linha_valor_parceiro: partnerValueLine("parceiro", 154) });
  assert.ok(!func.includes("repasse"));
  assert.ok(parc.includes("Seu repasse: R$"));
  assert.ok(parc.includes("154,00"));
});

test("telefone brasileiro vira link do WhatsApp com 55", () => {
  assert.equal(normalizeWhatsappPhone("(27) 99806-3956"), "5527998063956");
  assert.equal(normalizeWhatsappPhone("+55 27 99806-3956"), "5527998063956");
  assert.equal(normalizeWhatsappPhone("123"), null);
  assert.match(whatsappLink("27998063956", "Oi")!, /^https:\/\/wa\.me\/5527998063956\?text=Oi$/);
});
