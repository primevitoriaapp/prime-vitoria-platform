export type PricingCalculationType =
  | "fixed_price"
  | "km_with_minimum"
  | "daily_rate"
  | "hourly_plus_extra"
  | "event_package"
  | "custom";

export type PricingRuleRow = {
  id: string;
  tenant_id: string;
  client_id: string;
  name: string;
  calculation_type: PricingCalculationType;
  active: boolean;
  priority: number;
  fixed_price: number | null;
  price_per_km: number | null;
  minimum_km: number | null;
  minimum_value: number | null;
  included_hours: number | null;
  extra_hour_value: number | null;
  included_km: number | null;
  extra_km_value: number | null;
  night_fee: number | null;
  holiday_fee: number | null;
  toll_policy: string | null;
  parking_policy: string | null;
  settings: Record<string, unknown>;
};

export type PricingTripInput = {
  km_real: number | null;
  km_planned: number | null;
  /** Horas decorridas (opcional; hourly_plus_extra). */
  duration_hours: number | null;
  is_night?: boolean;
  is_holiday?: boolean;
};

export type PricingCalculationResult = {
  km_real: number | null;
  km_billable: number | null;
  amount_client: number;
  amount_driver: number;
  tolls: number;
  parking: number;
  extras: number;
  discount: number;
  net_margin: number;
  calculation_type: PricingCalculationType;
  breakdown: Record<string, unknown>;
};
