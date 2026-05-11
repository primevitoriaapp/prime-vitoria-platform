import test from "node:test";
import assert from "node:assert/strict";
import { omieIncluirContaReceber } from "../src/lib/integrations/omie-http.ts";
import { contaAzulCreateVendaFromReceivable } from "../src/lib/integrations/conta-azul-http.ts";
import { receivableHasOmieCliente, receivableHasContaAzulVendaFields } from "../src/lib/integrations/erp-mode.ts";
import type { ReceivableDTO } from "../src/lib/integrations/types.ts";

const sampleReceivable = (over: Partial<ReceivableDTO> = {}): ReceivableDTO => ({
  internalId: "00000000-0000-0000-0000-000000000099",
  tripId: "00000000-0000-0000-0000-000000000088",
  clientInternalId: "00000000-0000-0000-0000-000000000077",
  dueDate: "2026-06-01",
  amount: 150.5,
  description: "Teste integracao",
  externalReference: "trip-x",
  ...over
});

test("receivableHasOmieCliente uses DTO field", () => {
  assert.equal(receivableHasOmieCliente(sampleReceivable({ omieCodigoClienteFornecedor: 42 })), true);
});

test("receivableHasContaAzulVendaFields uses DTO fields", () => {
  assert.equal(
    receivableHasContaAzulVendaFields(
      sampleReceivable({
        contaAzulIdCliente: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        contaAzulIdItemServico: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"
      })
    ),
    true
  );
});

test("omieIncluirContaReceber parses JSON success with mocked fetch", async () => {
  const prev = globalThis.fetch;
  const envKeys = ["ERP_OMIE_APP_KEY", "ERP_OMIE_APP_SECRET", "ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR"] as const;
  const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};
  for (const k of envKeys) {
    saved[k] = process.env[k];
  }
  process.env.ERP_OMIE_APP_KEY = "key";
  process.env.ERP_OMIE_APP_SECRET = "secret";
  process.env.ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR = "999";

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ codigo_lancamento_omie: 12345, descricao_status: "OK" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

  try {
    const out = await omieIncluirContaReceber(sampleReceivable());
    assert.equal(out.externalId, "12345");
    assert.equal(out.externalStatus, "OK");
  } finally {
    globalThis.fetch = prev;
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  }
});

test("contaAzulCreateVendaFromReceivable uses mocked fetch (numero fixo)", async () => {
  const prev = globalThis.fetch;
  const envKeys = ["ERP_CONTA_AZUL_ACCESS_TOKEN", "ERP_CONTA_AZUL_NUMERO_VENDA"] as const;
  const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};
  for (const k of envKeys) {
    saved[k] = process.env[k];
  }
  process.env.ERP_CONTA_AZUL_ACCESS_TOKEN = "token";
  process.env.ERP_CONTA_AZUL_NUMERO_VENDA = "5001";
  const dto = sampleReceivable({
    contaAzulIdCliente: "11111111-2222-3333-4444-555555555555",
    contaAzulIdItemServico: "66666666-7777-8888-9999-aaaaaaaaaaaa"
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("proximo-numero")) {
      return new Response(JSON.stringify({ numero: 777 }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "venda-uuid-1", situacao: { nome: "APROVADO" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const out = await contaAzulCreateVendaFromReceivable(dto);
    assert.equal(out.externalId, "venda-uuid-1");
    assert.equal(out.externalStatus, "APROVADO");
  } finally {
    globalThis.fetch = prev;
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  }
});
