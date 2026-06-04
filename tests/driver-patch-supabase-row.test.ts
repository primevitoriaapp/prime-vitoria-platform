import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalDriverPatchRow,
  DRIVERS_TABLE_COLUMNS,
  driverRowToApiShape
} from "../src/lib/drivers/driver-supabase-row.ts";

/** Payload após normalizeDriverBody + cpf/full_name/phone (simula API PATCH). */
const NORMALIZED_FICHA = {
  full_name: "Rubens Danyel",
  cpf: "12345678901",
  phone: "27999999999",
  whatsapp: null,
  email: null,
  birth_date: null,
  cnh_number: null,
  cnh_category: "B",
  cnh_categories: ["B"],
  cnh_expiry: "2030-12-31",
  postal_code: "29050620",
  address: "Rua Exemplo",
  address_number: "100",
  district: "Centro",
  city: "Vitória",
  state: "ES",
  operational_category: "executivo",
  operational_categories: ["executivo"],
  service_regions: ["grande_vitoria"],
  service_region: "Grande Vitória",
  operational_notes: null,
  active: true,
  available: true,
  pix_key: null,
  bank_name: null,
  bank_branch: null,
  bank_account: null,
  bank_account_type: null,
  payee_name: null,
  payee_document: null,
  payout_price_per_km: null,
  payout_percent: null,
  notes: null
};

test("canonicalDriverPatchRow usa só colunas reais do Supabase", () => {
  const row = canonicalDriverPatchRow(NORMALIZED_FICHA);

  for (const key of Object.keys(row)) {
    assert.ok(DRIVERS_TABLE_COLUMNS.has(key), `coluna inválida no UPDATE: ${key}`);
  }

  assert.equal(row.cnh_expires_at, "2030-12-31");
  assert.equal(row.number, "100");
  assert.equal(row.complement, "Centro");
  assert.deepEqual(row.regions, ["grande_vitoria"]);
  assert.equal(row.postal_code, "29050620");
  assert.equal(row.address, "Rua Exemplo");
  assert.equal(row.city, "Vitória");

  assert.equal("cnh_expiry" in row, false);
  assert.equal("address_number" in row, false);
  assert.equal("bank_branch" in row, false);
  assert.equal("service_regions" in row, false);
  assert.equal("service_region" in row, false);
  assert.equal("operational_category" in row, false);
  assert.equal("cnh_categories" in row, false);
  assert.equal("state" in row, false);
  assert.equal("payee_name" in row, false);
  assert.equal("operational_status" in row, false);
});

test("driverRowToApiShape expõe nomes da UI a partir da linha Postgres", () => {
  const api = driverRowToApiShape({
    id: "00000000-0000-0000-0000-000000000001",
    cnh_expires_at: "2030-12-31",
    number: "100",
    bank_agency: "1234",
    regions: ["grande_vitoria"],
    complement: "Centro"
  });

  assert.equal(api.cnh_expiry, "2030-12-31");
  assert.equal(api.address_number, "100");
  assert.equal(api.bank_branch, "1234");
  assert.deepEqual(api.service_regions, ["grande_vitoria"]);
  assert.equal(api.district, "Centro");
});
