import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPricingCalculationMetadata,
  pricingFeatureFlagsSnapshot
} from "../src/lib/pricing/pricing-audit-meta.ts";
import { calculateTripPricing } from "../src/lib/pricing/calculate.ts";
import type { PricingRuleRow } from "../src/lib/pricing/types.ts";

function baseRule(): PricingRuleRow {
  return {
    id: "rule-audit",
    tenant_id: "t1",
    client_id: "c1",
    name: "Comexport",
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
    night_fee: 50,
    holiday_fee: null,
    toll_policy: null,
    parking_policy: null,
    settings: {}
  };
}

test("pricingFeatureFlagsSnapshot defaults all extended flags off", () => {
  const snap = pricingFeatureFlagsSnapshot(baseRule());
  assert.equal(snap.night_fee, false);
  assert.equal(snap.hourly_rate, false);
  assert.equal(snap.airport_transfer, false);
});

test("buildPricingCalculationMetadata includes audit fields", () => {
  const rule = baseRule();
  const result = calculateTripPricing(rule, {
    km_real: 12,
    km_planned: null,
    duration_hours: null,
    is_night: true
  });
  const meta = buildPricingCalculationMetadata(rule, result);
  assert.equal(meta.source, "pricing_engine");
  assert.equal(meta.km_billable, 20);
  assert.equal((meta.feature_flags_snapshot as { night_fee: boolean }).night_fee, false);
  assert.equal(result.amount_client, 100);
});

test("night_fee not applied when flag off (MVP backward compatible)", () => {
  const rule = baseRule();
  const result = calculateTripPricing(rule, {
    km_real: 12,
    km_planned: null,
    duration_hours: null,
    is_night: true
  });
  assert.equal(result.amount_client, 100);
  const customer = result.breakdown?.customer as Record<string, unknown> | undefined;
  assert.equal(customer?.night_fee, undefined);
});
