import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPlate, isValidPlate, parseCnh, parsePix, parseVehicle } from "../src/lib/drivers/change-request-rules.ts";

test("placas", () => {
  assert.ok(isValidPlate("rbj-6f74"));
  assert.ok(isValidPlate("ABC-1234"));
  assert.equal(formatPlate("abc1234"), "ABC-1234");
  assert.equal(formatPlate("rbj6f74"), "RBJ6F74");
  assert.ok(!isValidPlate("12345"));
});

test("veículo", () => {
  const r = parseVehicle({ brand: "Toyota", model: "Corolla XEi", plate: "rbj6f74", model_year: "2024", vehicle_category_id: "" });
  assert.ok(r.ok && r.value.plate === "RBJ6F74" && r.value.model_year === 2024);
  assert.equal(parseVehicle({ brand: "T", model: "Corolla", plate: "RBJ6F74" }).ok, false);
});

test("CNH vencida é recusada", () => {
  const today = new Date("2026-11-03T12:00:00Z");
  assert.equal(parseCnh({ cnh_number: "123.456.789-01", cnh_category: "ad", cnh_expires_at: "2031-05-01" }, today).ok, true);
  assert.equal(parseCnh({ cnh_number: "12345678901", cnh_category: "B", cnh_expires_at: "2025-01-01" }, today).ok, false);
});

test("PIX", () => {
  assert.equal(parsePix({ pix_key: "27999998888" }).ok, true);
  assert.equal(parsePix({ pix_key: "x" }).ok, false);
});
