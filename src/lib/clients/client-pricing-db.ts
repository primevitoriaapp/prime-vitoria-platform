import { db } from "@/lib/server/db";
import type { ClientPricingConfigInput, ClientPricingConfigRow } from "@/lib/clients/client-pricing-config";

export async function getClientPricingConfig(
  clientId: string,
  tenantId: string,
  serviceType = "default"
): Promise<ClientPricingConfigRow | null> {
  const { data, error } = await db
    .from("client_pricing_rules")
    .select("*")
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .eq("service_type", serviceType)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as ClientPricingConfigRow;
}

export async function upsertClientPricingConfig(
  clientId: string,
  tenantId: string,
  body: ClientPricingConfigInput
): Promise<{ data: ClientPricingConfigRow | null; error: Error | null }> {
  const serviceType = body.service_type?.trim() || "default";
  const row = {
    tenant_id: tenantId,
    client_id: clientId,
    service_type: serviceType,
    charge_type: body.charge_type,
    price_per_km: body.charge_type === "per_km" ? body.price_per_km ?? null : null,
    min_km: body.charge_type === "per_km" ? body.min_km ?? null : null,
    wait_tolerance_minutes: body.wait_tolerance_minutes ?? 10,
    wait_price_per_hour: body.wait_price_per_hour ?? null,
    fixed_price:
      body.charge_type === "fixed" ||
      body.charge_type === "daily" ||
      body.charge_type === "hourly"
        ? body.fixed_price ?? null
        : null,
    active: true,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await db
    .from("client_pricing_rules")
    .upsert(row, { onConflict: "client_id,service_type" })
    .select("*")
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as ClientPricingConfigRow, error: null };
}
