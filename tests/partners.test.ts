import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPartner, vehicleLimitFor } from "../src/lib/partners/partners-calc.ts";

test("limite de carros", () => {
  assert.equal(vehicleLimitFor("PF"), 2);
  assert.equal(vehicleLimitFor("PJ"), null);
});

test("limpa documento e campos vazios", () => {
  const p = cleanPartner({ type: "PJ", name: " Ilha Locadora ", document: "12.345.678/0001-90", phone: "", email: "" });
  assert.equal(p.name, "Ilha Locadora");
  assert.equal(p.document, "12345678000190");
  assert.equal(p.phone, null);
  assert.equal(p.email, null);
});
