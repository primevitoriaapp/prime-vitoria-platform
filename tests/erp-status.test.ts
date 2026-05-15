import test from "node:test";
import assert from "node:assert/strict";
import { buildErpIntegrationStatus } from "../src/lib/integrations/erp-status.ts";

test("buildErpIntegrationStatus lists omie and conta_azul", () => {
  const status = buildErpIntegrationStatus();
  assert.equal(status.providers.length, 2);
  const omie = status.providers.find((p) => p.provider === "omie");
  const ca = status.providers.find((p) => p.provider === "conta_azul");
  assert.ok(omie);
  assert.ok(ca);
  assert.ok(["live", "mock"].includes(omie!.mode));
  assert.ok(["live", "mock"].includes(ca!.mode));
});

test("omie mock mode is ready without global cliente", () => {
  const prevKey = process.env.ERP_OMIE_APP_KEY;
  const prevSecret = process.env.ERP_OMIE_APP_SECRET;
  const prevCliente = process.env.ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR;
  delete process.env.ERP_OMIE_APP_KEY;
  delete process.env.ERP_OMIE_APP_SECRET;
  delete process.env.ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR;
  try {
    const omie = buildErpIntegrationStatus().providers.find((p) => p.provider === "omie")!;
    assert.equal(omie.mode, "mock");
    assert.equal(omie.ready_for_sync, true);
  } finally {
    if (prevKey !== undefined) process.env.ERP_OMIE_APP_KEY = prevKey;
    if (prevSecret !== undefined) process.env.ERP_OMIE_APP_SECRET = prevSecret;
    if (prevCliente !== undefined) process.env.ERP_OMIE_CODIGO_CLIENTE_FORNECEDOR = prevCliente;
  }
});
