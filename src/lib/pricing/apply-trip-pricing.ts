import { db } from "@/lib/server/db";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { financialTitleBlocksRegeneration } from "@/lib/finance/financial-regeneration";
import { calculateTripPricing } from "@/lib/pricing/calculate";
import { buildPricingCalculationMetadata } from "@/lib/pricing/pricing-audit-meta";
import type { PricingRuleRow, PricingTripInput } from "@/lib/pricing/types";

export type ApplyTripPricingInput = {
  tripId: string;
  tenantId: string;
  clientId: string;
  actorUserId: string;
  kmReal: number | null;
  kmPlanned: number | null;
  scheduledAt?: string | null;
  completedAt?: string;
};

export type ApplyTripPricingResult = {
  applied: boolean;
  pricing_rule_id?: string;
  km_billable?: number | null;
  amount_client?: number;
  amount_driver?: number;
  skipped_reason?: string;
};

function durationHours(scheduledAt: string | null | undefined, completedAt: string | undefined): number | null {
  if (!scheduledAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(scheduledAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export async function loadActivePricingRule(
  tenantId: string,
  clientId: string
): Promise<PricingRuleRow | null> {
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

/** Aplica regra de precificação do cliente e grava `trip_financials` + metadados na viagem. */
export async function applyTripPricingOnCompletion(
  input: ApplyTripPricingInput
): Promise<ApplyTripPricingResult> {
  const rule = await loadActivePricingRule(input.tenantId, input.clientId);
  if (!rule) {
    return { applied: false, skipped_reason: "no_active_pricing_rule" };
  }

  const { data: existingFinancial } = await db
    .from("trip_financials")
    .select("trip_id, pricing_rule_id, calculation_metadata")
    .eq("trip_id", input.tripId)
    .maybeSingle();

  if (existingFinancial != null && existingFinancial.pricing_rule_id == null) {
    return { applied: false, skipped_reason: "manual_financials_exist" };
  }

  const [receivableRes, payableRes, tripDriver] = await Promise.all([
    db.from("accounts_receivable").select("status").eq("trip_id", input.tripId).eq("tenant_id", input.tenantId).maybeSingle(),
    db.from("driver_payables").select("status").eq("trip_id", input.tripId).eq("tenant_id", input.tenantId).maybeSingle(),
    db.from("trips").select("driver_id").eq("id", input.tripId).eq("tenant_id", input.tenantId).maybeSingle()
  ]);

  if (financialTitleBlocksRegeneration(receivableRes.data?.status as string | undefined)) {
    return { applied: false, skipped_reason: "receivable_locked" };
  }
  if (financialTitleBlocksRegeneration(payableRes.data?.status as string | undefined)) {
    return { applied: false, skipped_reason: "payable_locked" };
  }

  const pricingInput: PricingTripInput = {
    km_real: input.kmReal,
    km_planned: input.kmPlanned,
    duration_hours: durationHours(input.scheduledAt, input.completedAt)
  };

  const result = calculateTripPricing(rule, pricingInput);
  const calculationMetadata = buildPricingCalculationMetadata(rule, result);

  const { error: tripErr } = await db
    .from("trips")
    .update({
      km_billable: result.km_billable,
      pricing_rule_id: rule.id,
      calculation_metadata: calculationMetadata
    })
    .eq("id", input.tripId)
    .eq("tenant_id", input.tenantId);

  if (tripErr) {
    throw new Error(tripErr.message);
  }

  const { error: finErr } = await db.from("trip_financials").upsert(
    {
      trip_id: input.tripId,
      amount_client: result.amount_client,
      amount_driver: tripDriver.data?.driver_id ? result.amount_driver : 0,
      tolls: result.tolls,
      parking: result.parking,
      extras: result.extras,
      discount: result.discount,
      net_margin: result.net_margin,
      pricing_rule_id: rule.id,
      calculation_metadata: calculationMetadata
    },
    { onConflict: "trip_id" }
  );

  if (finErr) {
    throw new Error(finErr.message);
  }

  await insertAuditEvent({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "finance.pricing_applied",
    entityType: "trip",
    entityId: input.tripId,
    metadata: {
      pricing_rule_id: rule.id,
      calculation_type: result.calculation_type,
      km_real: result.km_real,
      km_billable: result.km_billable,
      amount_client: result.amount_client,
      amount_driver: result.amount_driver,
      net_margin: result.net_margin
    }
  });

  return {
    applied: true,
    pricing_rule_id: rule.id,
    km_billable: result.km_billable,
    amount_client: result.amount_client,
    amount_driver: result.amount_driver
  };
}
