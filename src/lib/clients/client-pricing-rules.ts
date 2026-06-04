import { getClientTenantId } from "@/lib/clients/client-tenant";
import { db } from "@/lib/server/db";
import type { PrimeChargeType } from "@/lib/pricing/prime-price-estimate";
import { normalizePrimeServiceType } from "@/lib/pricing/prime-service-types";

export type ClientPricingRuleRow = {
  id: string;
  client_id: string;
  tenant_id: string;
  service_type: string;
  charge_type: PrimeChargeType;
  price_per_km: number | null;
  min_km: number | null;
  fixed_price: number | null;
  driver_price_per_km: number | null;
  driver_min_km: number | null;
  driver_fixed_price: number | null;
  wait_tolerance_minutes: number;
  wait_price_per_hour: number | null;
  active: boolean;
};

export type ClientPricingRuleInput = {
  service_type: string;
  charge_type: PrimeChargeType;
  price_per_km?: number | null;
  min_km?: number | null;
  fixed_price?: number | null;
  driver_price_per_km?: number | null;
  driver_min_km?: number | null;
  driver_fixed_price?: number | null;
  active?: boolean;
};

const PRICING_RULE_COLUMNS =
  "id, client_id, tenant_id, service_type, charge_type, price_per_km, min_km, fixed_price, driver_price_per_km, driver_min_km, driver_fixed_price, wait_tolerance_minutes, wait_price_per_hour, active, created_at, updated_at";

export async function listClientPricingRules(
  clientId: string,
  sessionTenantId: string
): Promise<ClientPricingRuleRow[]> {
  const tenantId = await getClientTenantId(clientId, sessionTenantId);
  const { data, error } = await db
    .from("client_pricing_rules")
    .select(PRICING_RULE_COLUMNS)
    .eq("client_id", clientId)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("service_type");

  if (error || !data) return [];
  return data as ClientPricingRuleRow[];
}

export async function getClientPricingRule(
  clientId: string,
  sessionTenantId: string,
  serviceType: string
): Promise<ClientPricingRuleRow | null> {
  const tenantId = await getClientTenantId(clientId, sessionTenantId);
  const key = normalizePrimeServiceType(serviceType);
  const { data, error } = await db
    .from("client_pricing_rules")
    .select(PRICING_RULE_COLUMNS)
    .eq("client_id", clientId)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("service_type", key)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as ClientPricingRuleRow;
}

function rowFromInput(clientId: string, tenantId: string, body: ClientPricingRuleInput) {
  const service_type = normalizePrimeServiceType(body.service_type);
  const perKm = body.charge_type === "per_km";
  const fixedLike = body.charge_type === "fixed" || body.charge_type === "daily";

  return {
    tenant_id: tenantId,
    client_id: clientId,
    service_type,
    charge_type: body.charge_type,
    price_per_km: perKm ? body.price_per_km ?? null : null,
    min_km: perKm ? body.min_km ?? null : null,
    fixed_price: fixedLike || body.charge_type === "hourly" ? body.fixed_price ?? null : null,
    driver_price_per_km: perKm ? body.driver_price_per_km ?? null : null,
    driver_min_km: perKm ? body.driver_min_km ?? body.min_km ?? null : null,
    driver_fixed_price: fixedLike ? body.driver_fixed_price ?? null : null,
    wait_tolerance_minutes: 10,
    wait_price_per_hour: null,
    active: body.active !== false,
    updated_at: new Date().toISOString()
  };
}

export async function upsertClientPricingRule(
  clientId: string,
  sessionTenantId: string,
  body: ClientPricingRuleInput
): Promise<{ data: ClientPricingRuleRow | null; error: Error | null }> {
  const tenantId = await getClientTenantId(clientId, sessionTenantId);
  const row = rowFromInput(clientId, tenantId, body);
  const { data, error } = await db
    .from("client_pricing_rules")
    .upsert(row, { onConflict: "client_id,service_type" })
    .select(PRICING_RULE_COLUMNS)
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as ClientPricingRuleRow, error: null };
}

export async function upsertClientPricingRulesBatch(
  clientId: string,
  sessionTenantId: string,
  rules: ClientPricingRuleInput[]
): Promise<{ data: ClientPricingRuleRow[]; error: Error | null }> {
  const tenantId = await getClientTenantId(clientId, sessionTenantId);
  const rows = rules.map((r) => rowFromInput(clientId, tenantId, r));
  const { data, error } = await db
    .from("client_pricing_rules")
    .upsert(rows, { onConflict: "client_id,service_type" })
    .select(PRICING_RULE_COLUMNS);

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as ClientPricingRuleRow[], error: null };
}
