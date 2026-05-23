import { calculateNetMargin } from "../finance/margin.ts";
import {
  calculateDriverPayout,
  mergePricingMargins,
  parseDriverPayoutConfig
} from "./driver-payout.ts";
import { billableKmWithMinimum, resolveKmReal, roundKm, roundMoney } from "./pricing-utils.ts";
import type { PricingCalculationResult, PricingCalculationType, PricingRuleRow, PricingTripInput } from "./types.ts";

export { billableKmWithMinimum, resolveKmReal, roundKm, roundMoney } from "./pricing-utils.ts";

function num(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

function settingsNumber(rule: PricingRuleRow, key: string): number | null {
  const raw = rule.settings?.[key];
  return typeof raw === "number" && !Number.isNaN(raw) ? raw : null;
}

function applyFees(base: number, rule: PricingRuleRow, input: PricingTripInput): { extras: number; breakdown: Record<string, unknown> } {
  let extras = 0;
  const breakdown: Record<string, unknown> = {};
  if (input.is_night && rule.night_fee != null && rule.night_fee > 0) {
    extras += rule.night_fee;
    breakdown.night_fee = rule.night_fee;
  }
  if (input.is_holiday && rule.holiday_fee != null && rule.holiday_fee > 0) {
    extras += rule.holiday_fee;
    breakdown.holiday_fee = rule.holiday_fee;
  }
  return { extras: roundMoney(extras), breakdown };
}

function applyDriverPayout(
  rule: PricingRuleRow,
  input: PricingTripInput,
  amountClient: number,
  kmBillable: number | null,
  extras: number
): Pick<PricingCalculationResult, "amount_driver" | "net_margin"> & { driver_breakdown: Record<string, unknown> } {
  const driverConfig = parseDriverPayoutConfig(rule.settings);
  if (driverConfig) {
    const driver = calculateDriverPayout(driverConfig, input, kmBillable);
    const { net_margin } = mergePricingMargins(amountClient, driver.amount_driver, extras);
    return {
      amount_driver: driver.amount_driver,
      net_margin,
      driver_breakdown: driver.breakdown
    };
  }
  const amountDriver = driverAmountLegacy(rule, amountClient, kmBillable);
  return {
    amount_driver: amountDriver,
    net_margin: calculateNetMargin({
      amount_client: amountClient,
      amount_driver: amountDriver,
      tolls: 0,
      parking: 0,
      extras,
      discount: 0
    }),
    driver_breakdown: { type: "legacy_fallback" }
  };
}

function driverAmountLegacy(rule: PricingRuleRow, amountClient: number, kmBillable: number | null): number {
  const fixed = settingsNumber(rule, "driver_fixed_amount");
  if (fixed != null && fixed >= 0) return roundMoney(fixed);

  const perKm = settingsNumber(rule, "driver_price_per_km");
  if (perKm != null && kmBillable != null) return roundMoney(kmBillable * perKm);

  const share = settingsNumber(rule, "driver_share_pct");
  if (share != null && share >= 0) return roundMoney((amountClient * share) / 100);

  const ruleDriverPerKm = num(rule.price_per_km);
  if (ruleDriverPerKm != null && kmBillable != null) {
    const driverRate = settingsNumber(rule, "driver_km_rate_factor");
    const factor = driverRate != null && driverRate > 0 ? driverRate : 0.5;
    return roundMoney(kmBillable * ruleDriverPerKm * factor);
  }

  return 0;
}

function calcFixedPrice(rule: PricingRuleRow, input: PricingTripInput): PricingCalculationResult {
  const kmReal = resolveKmReal(input);
  const amount = roundMoney(num(rule.fixed_price) ?? 0);
  const { extras, breakdown: feeBreakdown } = applyFees(amount, rule, input);
  const amountClient = roundMoney(amount + extras);
  const kmBillable = kmReal;
  const driver = applyDriverPayout(rule, input, amountClient, kmBillable, extras);
  const financial = {
    amount_client: amountClient,
    amount_driver: driver.amount_driver,
    tolls: 0,
    parking: 0,
    extras,
    discount: 0
  };
  return {
    km_real: kmReal,
    km_billable: kmBillable,
    ...financial,
    net_margin: driver.net_margin,
    calculation_type: "fixed_price",
    breakdown: { customer: { base: amount, ...feeBreakdown }, driver: driver.driver_breakdown }
  };
}

function calcKmWithMinimum(rule: PricingRuleRow, input: PricingTripInput): PricingCalculationResult {
  const kmReal = resolveKmReal(input);
  const kmBillable = billableKmWithMinimum(kmReal, num(rule.minimum_km));
  const pricePerKm = num(rule.price_per_km) ?? 0;
  let amount = kmBillable != null ? kmBillable * pricePerKm : 0;
  const minValue = num(rule.minimum_value);
  if (minValue != null && amount < minValue) amount = minValue;
  const { extras, breakdown: feeBreakdown } = applyFees(amount, rule, input);
  const amountClient = roundMoney(amount + extras);
  const driver = applyDriverPayout(rule, input, amountClient, kmBillable, extras);
  const financial = {
    amount_client: amountClient,
    amount_driver: driver.amount_driver,
    tolls: 0,
    parking: 0,
    extras,
    discount: 0
  };
  return {
    km_real: kmReal,
    km_billable: kmBillable,
    ...financial,
    net_margin: driver.net_margin,
    calculation_type: "km_with_minimum",
    breakdown: {
      customer: {
        km_real: kmReal,
        minimum_km: rule.minimum_km,
        km_billable: kmBillable,
        price_per_km: pricePerKm,
        subtotal_km: kmBillable != null ? roundMoney(kmBillable * pricePerKm) : null,
        minimum_value_applied: minValue,
        ...feeBreakdown
      },
      driver: driver.driver_breakdown
    }
  };
}

function calcDailyRate(rule: PricingRuleRow, input: PricingTripInput): PricingCalculationResult {
  const kmReal = resolveKmReal(input);
  const daily =
    num(rule.fixed_price) ?? num(rule.minimum_value) ?? settingsNumber(rule, "daily_amount") ?? 0;
  const { extras, breakdown: feeBreakdown } = applyFees(daily, rule, input);
  const amountClient = roundMoney(daily + extras);
  const driver = applyDriverPayout(rule, input, amountClient, kmReal, extras);
  const financial = {
    amount_client: amountClient,
    amount_driver: driver.amount_driver,
    tolls: 0,
    parking: 0,
    extras,
    discount: 0
  };
  return {
    km_real: kmReal,
    km_billable: kmReal,
    ...financial,
    net_margin: driver.net_margin,
    calculation_type: "daily_rate",
    breakdown: { customer: { daily_rate: daily, ...feeBreakdown }, driver: driver.driver_breakdown }
  };
}

function calcHourlyPlusExtra(rule: PricingRuleRow, input: PricingTripInput): PricingCalculationResult {
  const kmReal = resolveKmReal(input);
  const includedKm = num(rule.included_km) ?? 0;
  const extraKm = kmReal != null ? Math.max(0, kmReal - includedKm) : 0;
  const extraKmValue = num(rule.extra_km_value) ?? 0;
  const kmExtraAmount = roundMoney(extraKm * extraKmValue);

  const includedHours = num(rule.included_hours) ?? 0;
  const duration = input.duration_hours ?? 0;
  const extraHours = Math.max(0, duration - includedHours);
  const extraHourValue = num(rule.extra_hour_value) ?? 0;
  const hoursExtraAmount = roundMoney(extraHours * extraHourValue);

  const base = num(rule.fixed_price) ?? num(rule.minimum_value) ?? 0;
  let amount = roundMoney(base + kmExtraAmount + hoursExtraAmount);
  const minValue = num(rule.minimum_value);
  if (minValue != null && amount < minValue) amount = minValue;

  const { extras, breakdown: feeBreakdown } = applyFees(amount, rule, input);
  const amountClient = roundMoney(amount + extras);
  const kmBillable = kmReal;
  const driver = applyDriverPayout(rule, input, amountClient, kmBillable, extras);
  const financial = {
    amount_client: amountClient,
    amount_driver: driver.amount_driver,
    tolls: 0,
    parking: 0,
    extras,
    discount: 0
  };
  return {
    km_real: kmReal,
    km_billable: kmBillable,
    ...financial,
    net_margin: driver.net_margin,
    calculation_type: "hourly_plus_extra",
    breakdown: {
      customer: {
        base,
        included_km: includedKm,
        extra_km: extraKm,
        extra_km_amount: kmExtraAmount,
        included_hours: includedHours,
        duration_hours: duration,
        extra_hours: extraHours,
        extra_hours_amount: hoursExtraAmount,
        ...feeBreakdown
      },
      driver: driver.driver_breakdown
    }
  };
}

function calcEventPackage(rule: PricingRuleRow, input: PricingTripInput): PricingCalculationResult {
  return { ...calcFixedPrice(rule, input), calculation_type: "event_package" };
}

function calcCustom(rule: PricingRuleRow, input: PricingTripInput): PricingCalculationResult {
  const customAmount = settingsNumber(rule, "amount_client") ?? num(rule.fixed_price) ?? 0;
  const patched = { ...rule, fixed_price: customAmount };
  return { ...calcFixedPrice(patched, input), calculation_type: "custom" };
}

/** Calcula valores a partir de uma regra activa e dados da corrida (função pura). */
export function calculateTripPricing(
  rule: PricingRuleRow,
  input: PricingTripInput
): PricingCalculationResult {
  const calculators: Record<PricingCalculationType, (r: PricingRuleRow, i: PricingTripInput) => PricingCalculationResult> = {
    fixed_price: calcFixedPrice,
    km_with_minimum: calcKmWithMinimum,
    daily_rate: calcDailyRate,
    hourly_plus_extra: calcHourlyPlusExtra,
    event_package: calcEventPackage,
    custom: calcCustom
  };
  const fn = calculators[rule.calculation_type];
  if (!fn) {
    throw new Error(`Unsupported calculation_type: ${rule.calculation_type}`);
  }
  return fn(rule, input);
}
