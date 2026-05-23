import { calculateNetMargin } from "../finance/margin.ts";
import { billableKmWithMinimum, resolveKmReal, roundMoney } from "./pricing-utils.ts";
import type { PricingCalculationType, PricingTripInput } from "./types.ts";

/** Repasse motorista — separado da precificação cliente (`settings.driver`). */
export type DriverPayoutConfig = {
  calculation_type?: PricingCalculationType | "fixed" | "km_with_minimum" | "daily";
  fixed_price?: number | null;
  price_per_km?: number | null;
  minimum_km?: number | null;
  daily_amount?: number | null;
};

function num(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return v;
}

export function parseDriverPayoutConfig(settings: Record<string, unknown> | null | undefined): DriverPayoutConfig | null {
  const raw = settings?.driver;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  return {
    calculation_type: d.calculation_type as DriverPayoutConfig["calculation_type"],
    fixed_price: num(d.fixed_price) ?? num(d.fixed_amount),
    price_per_km: num(d.price_per_km),
    minimum_km: num(d.minimum_km),
    daily_amount: num(d.daily_amount)
  };
}

export type DriverPayoutResult = {
  amount_driver: number;
  km_billable_driver: number | null;
  breakdown: Record<string, unknown>;
};

/**
 * Calcula repasse motorista com regras independentes do cliente.
 * Se `settings.driver` ausente, retorna null (caller usa fallback legado).
 */
export function calculateDriverPayout(
  config: DriverPayoutConfig,
  input: PricingTripInput,
  customerKmBillable: number | null
): DriverPayoutResult {
  const kmReal = resolveKmReal(input);
  const kind = config.calculation_type ?? "km_with_minimum";

  if (kind === "fixed_price" || kind === "fixed") {
    const amount = roundMoney(num(config.fixed_price) ?? 0);
    return {
      amount_driver: amount,
      km_billable_driver: kmReal,
      breakdown: { type: "fixed", amount }
    };
  }

  if (kind === "daily_rate" || kind === "daily") {
    const amount = roundMoney(num(config.daily_amount) ?? num(config.fixed_price) ?? 0);
    return {
      amount_driver: amount,
      km_billable_driver: kmReal,
      breakdown: { type: "daily", amount }
    };
  }

  const minKm = num(config.minimum_km);
  const kmBillableDriver = billableKmWithMinimum(kmReal, minKm) ?? customerKmBillable;
  const pricePerKm = num(config.price_per_km) ?? 0;
  const amount = kmBillableDriver != null ? roundMoney(kmBillableDriver * pricePerKm) : 0;

  return {
    amount_driver: amount,
    km_billable_driver: kmBillableDriver,
    breakdown: {
      type: "km_with_minimum",
      km_real: kmReal,
      minimum_km: minKm,
      km_billable: kmBillableDriver,
      price_per_km: pricePerKm
    }
  };
}

export function mergePricingMargins(
  amountClient: number,
  amountDriver: number,
  extras: number
): { net_margin: number } {
  return {
    net_margin: calculateNetMargin({
      amount_client: amountClient,
      amount_driver: amountDriver,
      tolls: 0,
      parking: 0,
      extras,
      discount: 0
    })
  };
}
