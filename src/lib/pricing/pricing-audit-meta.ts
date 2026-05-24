import { PRICING_FEATURE_FLAGS, isPricingFeatureEnabled } from "./feature-flags.ts";
import type { PricingCalculationResult, PricingRuleRow } from "./types.ts";

/** Snapshot read-only das flags no momento do cálculo (auditoria / prep fases futuras). */
export function pricingFeatureFlagsSnapshot(rule: PricingRuleRow): Record<string, boolean> {
  return Object.fromEntries(
    (Object.keys(PRICING_FEATURE_FLAGS) as (keyof typeof PRICING_FEATURE_FLAGS)[]).map((key) => [
      key,
      isPricingFeatureEnabled(key, rule)
    ])
  );
}

export function buildPricingCalculationMetadata(
  rule: PricingRuleRow,
  result: PricingCalculationResult
): Record<string, unknown> {
  const profile =
    typeof rule.settings?.pricing_profile === "string"
      ? rule.settings.pricing_profile
      : rule.calculation_type;

  return {
    source: "pricing_engine",
    pricing_rule_applied: rule.id,
    rule_id: rule.id,
    rule_name: rule.name,
    calculation_type: result.calculation_type,
    pricing_profile: profile,
    feature_flags_snapshot: pricingFeatureFlagsSnapshot(rule),
    km_real: result.km_real,
    km_billable: result.km_billable,
    amount_client: result.amount_client,
    amount_driver: result.amount_driver,
    net_margin: result.net_margin,
    breakdown: result.breakdown,
    applied_at: new Date().toISOString()
  };
}
