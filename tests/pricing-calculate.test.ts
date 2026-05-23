import test from "node:test";
import assert from "node:assert/strict";
import {
  billableKmWithMinimum,
  calculateTripPricing,
  resolveKmReal,
  roundMoney
} from "../src/lib/pricing/calculate.ts";
import type { PricingRuleRow } from "../src/lib/pricing/types.ts";

function baseRule(overrides: Partial<PricingRuleRow>): PricingRuleRow {
  return {
    id: "rule-1",
    tenant_id: "t1",
    client_id: "c1",
    name: "Test",
    calculation_type: "km_with_minimum",
    active: true,
    priority: 0,
    fixed_price: null,
    price_per_km: 5,
    minimum_km: 20,
    minimum_value: null,
    included_hours: null,
    extra_hour_value: null,
    included_km: null,
    extra_km_value: null,
    night_fee: null,
    holiday_fee: null,
    toll_policy: null,
    parking_policy: null,
    settings: { driver: { calculation_type: "km_with_minimum", price_per_km: 2.5, minimum_km: 20 } },
    ...overrides
  };
}

test("billableKmWithMinimum applies floor", () => {
  assert.equal(billableKmWithMinimum(12, 20), 20);
  assert.equal(billableKmWithMinimum(32, 20), 32);
  assert.equal(billableKmWithMinimum(null, 20), 20);
});

test("km_with_minimum: 12 km real bills 20 km", () => {
  const rule = baseRule({ calculation_type: "km_with_minimum", price_per_km: 5, minimum_km: 20 });
  const result = calculateTripPricing(rule, { km_real: 12, km_planned: null, duration_hours: null });
  assert.equal(result.km_billable, 20);
  assert.equal(result.amount_client, 100);
  assert.equal(result.amount_driver, 50);
});

test("km_with_minimum: 32 km real bills 32 km", () => {
  const rule = baseRule({ calculation_type: "km_with_minimum", price_per_km: 5, minimum_km: 20 });
  const result = calculateTripPricing(rule, { km_real: 32, km_planned: null, duration_hours: null });
  assert.equal(result.km_billable, 32);
  assert.equal(result.amount_client, 160);
});

test("fixed_price uses fixed amount", () => {
  const rule = baseRule({ calculation_type: "fixed_price", fixed_price: 180, price_per_km: null });
  const result = calculateTripPricing(rule, { km_real: 8, km_planned: 10, duration_hours: null });
  assert.equal(result.amount_client, 180);
  assert.equal(result.calculation_type, "fixed_price");
});

test("daily_rate uses fixed_price as diária", () => {
  const rule = baseRule({ calculation_type: "daily_rate", fixed_price: 700 });
  const result = calculateTripPricing(rule, { km_real: 45, km_planned: null, duration_hours: null });
  assert.equal(result.amount_client, 700);
});

test("resolveKmReal prefers actual over planned", () => {
  assert.equal(resolveKmReal({ km_real: 12, km_planned: 30, duration_hours: null }), 12);
  assert.equal(resolveKmReal({ km_real: null, km_planned: 30, duration_hours: null }), 30);
});

test("km_with_minimum: driver payout independent from customer", () => {
  const rule = baseRule({
    calculation_type: "km_with_minimum",
    price_per_km: 5,
    minimum_km: 20,
    settings: {
      driver: { calculation_type: "km_with_minimum", price_per_km: 3, minimum_km: 15 }
    }
  });
  const result = calculateTripPricing(rule, { km_real: 12, km_planned: null, duration_hours: null });
  assert.equal(result.km_billable, 20);
  assert.equal(result.amount_client, 100);
  assert.equal(result.amount_driver, 45);
  assert.equal((result.breakdown as { driver: { km_billable: number } }).driver.km_billable, 15);
});

test("roundMoney", () => {
  assert.equal(roundMoney(10.556), 10.56);
});
