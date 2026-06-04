import { plannedKmFromCoords, type TripCoords } from "../trips/km-distance.ts";

export type PrimeChargeType = "per_km" | "fixed" | "daily" | "hourly";

export type PrimePricingRuleInput = {
  charge_type: PrimeChargeType;
  price_per_km?: number | null;
  min_km?: number | null;
  fixed_price?: number | null;
  driver_price_per_km?: number | null;
  driver_min_km?: number | null;
  driver_fixed_price?: number | null;
};

export type PrimePriceEstimate = {
  planned_km: number | null;
  billable_km: number | null;
  client_amount: number;
  driver_amount: number;
  margin: number;
  charge_type: PrimeChargeType;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function billableKm(plannedKm: number | null, minKm: number | null): number | null {
  if (plannedKm == null) return minKm != null && minKm > 0 ? minKm : null;
  const min = minKm ?? 0;
  return Math.max(plannedKm, min);
}

function amountPerKm(km: number | null, rate: number | null, minKm: number | null): number {
  if (rate == null || rate <= 0) return 0;
  const kmUse = billableKm(km, minKm);
  if (kmUse == null) return 0;
  return roundMoney(kmUse * rate);
}

function amountFixed(value: number | null): number {
  if (value == null || value <= 0) return 0;
  return roundMoney(value);
}

/** Estima valores cliente, motorista e margem a partir da regra e coordenadas. */
export function estimatePrimeTripAmounts(
  rule: PrimePricingRuleInput,
  coords: TripCoords
): PrimePriceEstimate {
  const planned_km = plannedKmFromCoords(coords);
  const charge = rule.charge_type;

  let client_amount = 0;
  let driver_amount = 0;

  if (charge === "per_km") {
    client_amount = amountPerKm(planned_km, rule.price_per_km ?? null, rule.min_km ?? null);
    driver_amount = amountPerKm(
      planned_km,
      rule.driver_price_per_km ?? null,
      rule.driver_min_km ?? rule.min_km ?? null
    );
  } else {
    client_amount = amountFixed(rule.fixed_price ?? null);
    driver_amount = amountFixed(rule.driver_fixed_price ?? null);
  }

  const margin = roundMoney(client_amount - driver_amount);
  const billable_km =
    charge === "per_km" ? billableKm(planned_km, rule.min_km ?? null) : null;

  return {
    planned_km,
    billable_km,
    client_amount,
    driver_amount,
    margin,
    charge_type: charge
  };
}

/** Margem a partir de valores editados manualmente. */
export function primeMarginFromAmounts(client: number, driver: number): number {
  return roundMoney((Number(client) || 0) - (Number(driver) || 0));
}
