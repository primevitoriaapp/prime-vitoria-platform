import { db } from "@/lib/server/db";
import { getClientPricingConfig } from "@/lib/clients/client-pricing-db";
import { clientPricingRowToEngineRule } from "@/lib/clients/client-pricing-config";
import type { PricingRuleRow } from "@/lib/pricing/types";

/** Regra activa: prioriza client_pricing_rules, depois pricing_rules legado. */
export async function loadActivePricingRule(
  tenantId: string,
  clientId: string
): Promise<PricingRuleRow | null> {
  const clientRule = await getClientPricingConfig(clientId, tenantId);
  if (clientRule) {
    return clientPricingRowToEngineRule(clientRule, tenantId);
  }

  const { data, error } = await db
    .from("pricing_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as PricingRuleRow;
}

export type DriverPayoutOverride = {
  payout_price_per_km: number | null;
  payout_percent: number | null;
};

export async function loadDriverPayoutOverride(driverId: string | null | undefined): Promise<DriverPayoutOverride | null> {
  if (!driverId) return null;
  const { data } = await db
    .from("drivers")
    .select("payout_price_per_km, payout_percent")
    .eq("id", driverId)
    .maybeSingle();
  if (!data) return null;
  return {
    payout_price_per_km:
      data.payout_price_per_km != null ? Number(data.payout_price_per_km) : null,
    payout_percent: data.payout_percent != null ? Number(data.payout_percent) : null
  };
}

/** Injeta repasse do motorista na regra (settings) quando configurado na ficha. */
export function mergeDriverPayoutIntoRule(
  rule: PricingRuleRow,
  payout: DriverPayoutOverride | null
): PricingRuleRow {
  if (!payout) return rule;
  const settings = { ...(rule.settings ?? {}) };

  if (payout.payout_price_per_km != null && payout.payout_price_per_km > 0) {
    settings.driver = {
      calculation_type: "km_with_minimum",
      price_per_km: payout.payout_price_per_km,
      minimum_km: rule.minimum_km
    };
    settings.driver_payout_mode = "per_km";
  } else if (payout.payout_percent != null && payout.payout_percent > 0) {
    settings.driver_share_pct = payout.payout_percent;
    settings.driver_payout_mode = "percent";
    delete settings.driver;
  }

  return { ...rule, settings };
}
