import test from "node:test";
import assert from "node:assert/strict";
import { parseWebhookPayload } from "../src/lib/integrations/parse-webhook-payload.ts";

test("parseWebhookPayload detects Omie baixa via PV integration code", () => {
  const receivableId = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
  const parsed = parseWebhookPayload("omie", {
    evento: "Financas.ContaReceber.Baixa",
    dados: { codigo_lancamento_integracao: `PV-${receivableId}` }
  });
  assert.equal(parsed.kind, "receivable_paid");
  assert.equal(parsed.receivableInternalId, receivableId);
});

test("parseWebhookPayload marks unknown payloads", () => {
  const parsed = parseWebhookPayload("generic", { ping: true });
  assert.equal(parsed.kind, "unknown");
});

test("parseWebhookPayload detects Omie topic baixa without PV in root", () => {
  const parsed = parseWebhookPayload("omie", {
    topic: "Financas.ContaReceber.Baixa",
    event: { codigo_lancamento_omie: "998877" }
  });
  assert.equal(parsed.kind, "receivable_paid");
  assert.equal(parsed.externalId, "998877");
});

test("parseWebhookPayload reads nested event PV code", () => {
  const receivableId = "b2c3d4e5-f6a7-4890-b123-456789abcdef";
  const parsed = parseWebhookPayload("conta_azul", {
    event: "sale.paid",
    data: { codigo_lancamento_integracao: `PV-${receivableId}` }
  });
  assert.equal(parsed.kind, "receivable_paid");
  assert.equal(parsed.receivableInternalId, receivableId);
});
