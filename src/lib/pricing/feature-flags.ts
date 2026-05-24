import type { PricingCalculationType, PricingRuleRow } from "./types.ts";

/**
 * Tipos de precificação além do MVP — desactivados por defeito.
 * Activar via env `PRICING_FEATURE_<KEY>=true` ou `settings.features` na regra.
 */
export const PRICING_FEATURE_FLAGS = {
  hourly_rate: false,
  airport_transfer: false,
  event_package: false,
  fixed_plus_km: false,
  waiting_time: false,
  night_fee: false,
  tolls_auto: false,
  parking_auto: false
} as const;

export type PricingFeatureKey = keyof typeof PRICING_FEATURE_FLAGS;

export type ExtendedPricingProfile =
  | PricingCalculationType
  | "hourly_rate"
  | "airport_transfer"
  | "fixed_plus_km"
  | "waiting_time";

function envFlag(key: PricingFeatureKey): boolean | null {
  const raw = process.env[`PRICING_FEATURE_${key.toUpperCase()}`]?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return null;
}

function ruleFeatureOverride(rule: PricingRuleRow, key: PricingFeatureKey): boolean | null {
  const features = rule.settings?.features;
  if (!features || typeof features !== "object" || Array.isArray(features)) return null;
  const v = (features as Record<string, unknown>)[key];
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

/** Feature activa globalmente, por env ou override na regra (`settings.features`). */
export function isPricingFeatureEnabled(key: PricingFeatureKey, rule?: PricingRuleRow): boolean {
  const override = rule ? ruleFeatureOverride(rule, key) : null;
  if (override != null) return override;
  const fromEnv = envFlag(key);
  if (fromEnv != null) return fromEnv;
  return PRICING_FEATURE_FLAGS[key];
}

/**
 * Resolve perfil extendido para tipo MVP suportado pelo motor actual.
 * Perfis desactivados lançam erro explícito (não silencioso).
 */
export function resolveEffectiveCalculationType(rule: PricingRuleRow): PricingCalculationType {
  const profile =
    (typeof rule.settings?.pricing_profile === "string"
      ? rule.settings.pricing_profile
      : rule.calculation_type) as ExtendedPricingProfile;

  switch (profile) {
    case "hourly_rate":
      if (!isPricingFeatureEnabled("hourly_rate", rule)) {
        throw new Error("Pricing feature disabled: hourly_rate");
      }
      return "hourly_plus_extra";
    case "airport_transfer":
      if (!isPricingFeatureEnabled("airport_transfer", rule)) {
        throw new Error("Pricing feature disabled: airport_transfer");
      }
      return "fixed_price";
    case "fixed_plus_km":
      if (!isPricingFeatureEnabled("fixed_plus_km", rule)) {
        throw new Error("Pricing feature disabled: fixed_plus_km");
      }
      return "km_with_minimum";
    case "waiting_time":
      if (!isPricingFeatureEnabled("waiting_time", rule)) {
        throw new Error("Pricing feature disabled: waiting_time");
      }
      return rule.calculation_type;
    default:
      return profile as PricingCalculationType;
  }
}
