import type { PricingCalculationType, PricingRuleRow } from "@/lib/pricing/types";

export const CHARGE_TYPE_OPTIONS = [
  { id: "per_km", label: "Por km" },
  { id: "fixed", label: "Valor fixo" },
  { id: "daily", label: "Diária" },
  { id: "hourly", label: "Por hora" }
] as const;

export type ClientChargeType = (typeof CHARGE_TYPE_OPTIONS)[number]["id"];

export type ClientPricingConfigInput = {
  service_type?: string;
  charge_type: ClientChargeType;
  price_per_km?: number | null;
  min_km?: number | null;
  wait_tolerance_minutes?: number | null;
  wait_price_per_hour?: number | null;
  fixed_price?: number | null;
};

export type ClientPricingConfigRow = ClientPricingConfigInput & {
  id: string;
  client_id: string;
  tenant_id: string;
  active: boolean;
};

const CHARGE_TO_CALC: Record<ClientChargeType, PricingCalculationType> = {
  per_km: "km_with_minimum",
  fixed: "fixed_price",
  daily: "daily_rate",
  hourly: "hourly_plus_extra"
};

/** Converte linha de client_pricing_rules para formato do motor de precificação. */
export function clientPricingRowToEngineRule(
  row: ClientPricingConfigRow,
  tenantId: string
): PricingRuleRow {
  const calculation_type = CHARGE_TO_CALC[row.charge_type] ?? "km_with_minimum";
  return {
    id: row.id,
    tenant_id: tenantId,
    client_id: row.client_id,
    name: `Cobrança ${row.service_type}`,
    calculation_type,
    active: row.active,
    priority: 100,
    fixed_price: row.fixed_price ?? null,
    price_per_km: row.price_per_km ?? null,
    minimum_km: row.min_km ?? null,
    minimum_value: null,
    included_hours: row.charge_type === "hourly" ? 1 : null,
    extra_hour_value: row.charge_type === "hourly" ? (row.fixed_price ?? null) : null,
    included_km: null,
    extra_km_value: null,
    night_fee: null,
    holiday_fee: null,
    toll_policy: null,
    parking_policy: null,
    settings: {
      source: "client_pricing_rules",
      wait_tolerance_minutes: row.wait_tolerance_minutes,
      wait_price_per_hour: row.wait_price_per_hour,
      charge_type: row.charge_type
    }
  };
}

export function emptyClientPricingConfig(): ClientPricingConfigInput {
  return {
    service_type: "default",
    charge_type: "per_km",
    price_per_km: 4.5,
    min_km: 20,
    wait_tolerance_minutes: 10,
    wait_price_per_hour: 80,
    fixed_price: null
  };
}
