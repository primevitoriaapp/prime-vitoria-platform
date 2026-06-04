import { db } from "@/lib/server/db";
import type { PrimeChargeType } from "@/lib/pricing/prime-price-estimate";
import { normalizePrimeServiceType } from "@/lib/pricing/prime-service-types";

export type DriverPayoutRuleRow = {
  id: string;
  driver_id: string;
  tenant_id: string;
  service_type: string;
  charge_type: PrimeChargeType;
  price_per_km: number | null;
  min_km: number | null;
  fixed_price: number | null;
  active: boolean;
};

export type DriverPayoutRuleInput = {
  service_type: string;
  charge_type: PrimeChargeType;
  price_per_km?: number | null;
  min_km?: number | null;
  fixed_price?: number | null;
  active?: boolean;
};

export async function listDriverPayoutRules(
  driverId: string,
  tenantId: string
): Promise<DriverPayoutRuleRow[]> {
  const { data, error } = await db
    .from("driver_payout_rules")
    .select("*")
    .eq("driver_id", driverId)
    .eq("tenant_id", tenantId)
    .order("service_type");

  if (error || !data) return [];
  return data as DriverPayoutRuleRow[];
}

export async function getDriverPayoutRule(
  driverId: string,
  tenantId: string,
  serviceType: string
): Promise<DriverPayoutRuleRow | null> {
  const key = normalizePrimeServiceType(serviceType);
  const { data, error } = await db
    .from("driver_payout_rules")
    .select("*")
    .eq("driver_id", driverId)
    .eq("tenant_id", tenantId)
    .eq("service_type", key)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as DriverPayoutRuleRow;
}

function rowFromInput(driverId: string, tenantId: string, body: DriverPayoutRuleInput) {
  const service_type = normalizePrimeServiceType(body.service_type);
  const perKm = body.charge_type === "per_km";
  const fixedLike = body.charge_type === "fixed" || body.charge_type === "daily";

  return {
    tenant_id: tenantId,
    driver_id: driverId,
    service_type,
    charge_type: body.charge_type,
    price_per_km: perKm ? body.price_per_km ?? null : null,
    min_km: perKm ? body.min_km ?? null : null,
    fixed_price: fixedLike || body.charge_type === "hourly" ? body.fixed_price ?? null : null,
    active: body.active !== false,
    updated_at: new Date().toISOString()
  };
}

export async function upsertDriverPayoutRulesBatch(
  driverId: string,
  tenantId: string,
  rules: DriverPayoutRuleInput[]
): Promise<{ data: DriverPayoutRuleRow[]; error: Error | null }> {
  const rows = rules.map((r) => rowFromInput(driverId, tenantId, r));
  const { data, error } = await db
    .from("driver_payout_rules")
    .upsert(rows, { onConflict: "driver_id,service_type" })
    .select("*");

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as DriverPayoutRuleRow[], error: null };
}
