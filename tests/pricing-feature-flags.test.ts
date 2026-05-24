import test from "node:test";
import assert from "node:assert/strict";
import {
  isPricingFeatureEnabled,
  resolveEffectiveCalculationType
} from "../src/lib/pricing/feature-flags.ts";
import type { PricingRuleRow } from "../src/lib/pricing/types.ts";

function baseRule(overrides: Partial<PricingRuleRow> = {}): PricingRuleRow {
  return {
    id: "r1",
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
    settings: {},
    ...overrides
  };
}

test("MVP types work without extended profile", () => {
  assert.equal(resolveEffectiveCalculationType(baseRule()), "km_with_minimum");
});

test("airport_transfer disabled by default throws", () => {
  const rule = baseRule({ settings: { pricing_profile: "airport_transfer" } });
  assert.throws(() => resolveEffectiveCalculationType(rule), /airport_transfer/);
});

test("airport_transfer enabled via settings.features", () => {
  const rule = baseRule({
    settings: { pricing_profile: "airport_transfer", features: { airport_transfer: true } }
  });
  assert.equal(resolveEffectiveCalculationType(rule), "fixed_price");
});

test("night_fee disabled by default", () => {
  assert.equal(isPricingFeatureEnabled("night_fee"), false);
});

test("event_package disabled by default", () => {
  assert.equal(isPricingFeatureEnabled("event_package"), false);
});

test("tolls_auto disabled by default", () => {
  assert.equal(isPricingFeatureEnabled("tolls_auto"), false);
});
