import { test } from "node:test";
import assert from "node:assert/strict";
import { docState, worstDocState } from "../src/lib/vehicles/vehicle-docs.ts";

test("documentos do veículo", () => {
  assert.equal(docState("2026-10-01", "2026-10-29"), "vencido");
  assert.equal(docState("2026-11-20", "2026-10-29"), "vence_30");
  assert.equal(docState("2027-03-01", "2026-10-29"), "ok");
  assert.equal(docState(null, "2026-10-29"), "sem_data");
  assert.equal(worstDocState({ insurance_expires_at: "2027-01-01", licensing_expires_at: "2026-10-01", inspection_expires_at: null }, "2026-10-29"), "vencido");
});
