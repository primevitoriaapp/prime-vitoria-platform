import { db } from "@/lib/server/db";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { financialTitleBlocksRegeneration } from "@/lib/finance/financial-regeneration";
import { calculateTripPricing } from "@/lib/pricing/calculate";
import {
  loadActivePricingRule,
  loadDriverPayoutOverride,
  mergeDriverPayoutIntoRule
} from "@/lib/pricing/load-active-pricing";
import { buildPricingCalculationMetadata } from "@/lib/pricing/pricing-audit-meta";
import type { PricingTripInput } from "@/lib/pricing/types";
import { getClientPricingConfig } from "@/lib/clients/client-pricing-db";
import { clientPricingRowToEngineRule } from "@/lib/clients/client-pricing-config";
import { calculateWaitCharge, getClientBillingTerms } from "@/lib/clients/client-billing-terms";
import { resolvePricingServiceType } from "@/lib/pricing/corporativo-bandeira";
import { roundMoney } from "@/lib/pricing/pricing-utils";

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

export { loadActivePricingRule } from "@/lib/pricing/load-active-pricing";

/** Aplica regra de precificação do cliente e grava `trip_financials` + metadados na viagem. */
export async function applyTripPricingOnCompletion(
  input: ApplyTripPricingInput
): Promise<ApplyTripPricingResult> {
  const { data: tripRow } = await db
    .from("trips")
    .select("driver_id, service_type, scheduled_at, wait_minutes")
    .eq("id", input.tripId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  // Regra do tipo de serviço da corrida (corporativo → Bandeira 1 ou 2 pelo horário);
  // sem regra específica, cai na regra geral do cliente.
  const serviceKey = tripRow?.service_type
    ? resolvePricingServiceType(
        String(tripRow.service_type),
        (tripRow.scheduled_at as string | null) ?? input.scheduledAt ?? null
      )
    : null;
  const serviceRow = serviceKey ? await getClientPricingConfig(input.clientId, input.tenantId, serviceKey) : null;
  const baseRule = serviceRow
    ? clientPricingRowToEngineRule(serviceRow, input.tenantId)
    : await loadActivePricingRule(input.tenantId, input.clientId);
  if (!baseRule) {
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

  const [receivableRes, payableRes] = await Promise.all([
    db.from("accounts_receivable").select("status").eq("trip_id", input.tripId).eq("tenant_id", input.tenantId).maybeSingle(),
    db.from("driver_payables").select("status").eq("trip_id", input.tripId).eq("tenant_id", input.tenantId).maybeSingle()
  ]);
  const tripDriver = { data: tripRow ? { driver_id: tripRow.driver_id } : null };

  if (financialTitleBlocksRegeneration(receivableRes.data?.status as string | undefined)) {
    return { applied: false, skipped_reason: "receivable_locked" };
  }
  if (financialTitleBlocksRegeneration(payableRes.data?.status as string | undefined)) {
    return { applied: false, skipped_reason: "payable_locked" };
  }

  const driverPayout = await loadDriverPayoutOverride(tripDriver.data?.driver_id as string | undefined);
  const rule = mergeDriverPayoutIntoRule(baseRule, driverPayout);

  const pricingInput: PricingTripInput = {
    km_real: input.kmReal,
    km_planned: input.kmPlanned,
    duration_hours: durationHours(input.scheduledAt, input.completedAt)
  };

  const baseResult = calculateTripPricing(rule, pricingInput);

  // Hora parada do cadastro do cliente: tolerância + valor proporcional ao tempo.
  const terms = await getClientBillingTerms(input.clientId, input.tenantId);
  const wait = calculateWaitCharge(tripRow?.wait_minutes as number | null | undefined, terms);
  const hasDriver = Boolean(tripDriver.data?.driver_id);
  const result =
    wait.client_amount > 0 || wait.driver_amount > 0
      ? {
          ...baseResult,
          amount_client: roundMoney(baseResult.amount_client + wait.client_amount),
          amount_driver: roundMoney(baseResult.amount_driver + wait.driver_amount),
          net_margin: roundMoney(baseResult.net_margin + wait.client_amount - wait.driver_amount),
          breakdown: { ...baseResult.breakdown, wait }
        }
      : { ...baseResult, breakdown: { ...baseResult.breakdown, wait } };
  const calculationMetadata = {
    ...buildPricingCalculationMetadata(rule, result),
    service_pricing_key: serviceKey,
    wait
  };

  const { error: tripErr } = await db
    .from("trips")
    .update({
      km_billable: result.km_billable,
      pricing_rule_id: rule.id,
      calculation_metadata: calculationMetadata,
      client_amount: result.amount_client,
      driver_amount: hasDriver ? result.amount_driver : 0,
      margin: hasDriver ? result.net_margin : result.amount_client
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
      amount_driver: hasDriver ? result.amount_driver : 0,
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
