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
import { priceFromCategoryTable, type PriceCell, type ServiceMode } from "@/lib/pricing/category-catalog";

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

/**
 * Tabela nova (veículo × serviço da empresa). Retorna null quando a corrida não usa a tabela nova
 * ou a célula está sem valor — aí segue o motor antigo / valor digitado na corrida.
 */
async function applyCategoryPricing(input: ApplyTripPricingInput): Promise<ApplyTripPricingResult | null> {
  const { data: trip } = await db
    .from("trips")
    .select("vehicle_category_id, service_mode, driver_id, scheduled_at, wait_minutes, client_amount, driver_amount")
    .eq("id", input.tripId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!trip?.vehicle_category_id || !trip.service_mode) return null;

  const { data: rows } = await db
    .from("client_category_prices")
    .select("service, enabled, client_price, partner_price")
    .eq("client_id", input.clientId)
    .eq("category_id", trip.vehicle_category_id);
  const cells: PriceCell[] = (rows ?? []).map((r) => ({
    service: r.service as PriceCell["service"],
    enabled: Boolean(r.enabled),
    client_price: r.client_price == null ? null : Number(r.client_price),
    partner_price: r.partner_price == null ? null : Number(r.partner_price)
  }));

  const km = input.kmReal ?? input.kmPlanned ?? null;
  const usedHours = durationHours(input.scheduledAt ?? (trip.scheduled_at as string), input.completedAt);
  const table = priceFromCategoryTable({
    mode: trip.service_mode as ServiceMode,
    scheduledAt: (trip.scheduled_at as string) ?? input.scheduledAt ?? new Date().toISOString(),
    km,
    usedHours,
    cells
  });

  // Valor digitado pela central na corrida tem prioridade (orçamento combinado).
  const quotedClient = Number(trip.client_amount) || 0;
  const quotedDriver = Number(trip.driver_amount) || 0;
  let client = quotedClient > 0 ? quotedClient : table.client;
  let partner = quotedClient > 0 ? (quotedDriver > 0 ? quotedDriver : table.partner) : table.partner;
  if (client == null) return null;

  // Hora parada: valores da tabela do veículo, se houver; senão os do cadastro da empresa.
  const terms = await getClientBillingTerms(input.clientId, input.tenantId);
  const hp = cells.find((c) => c.service === "hora_parada" && c.enabled);
  const wait = calculateWaitCharge(trip.wait_minutes as number | null | undefined, {
    ...terms,
    wait_client_price_per_hour: hp?.client_price ?? terms.wait_client_price_per_hour,
    wait_driver_price_per_hour: hp?.partner_price ?? terms.wait_driver_price_per_hour
  });
  client = roundMoney(client + wait.client_amount);
  partner = partner == null ? null : roundMoney(partner + wait.driver_amount);

  const hasDriver = Boolean(trip.driver_id);
  const driverAmount = hasDriver ? (partner ?? 0) : 0;
  const margin = roundMoney(client - driverAmount);
  const metadata = { source: "categoria", detail: table.detail, km, used_hours: usedHours, wait, quoted: quotedClient > 0 };

  const { error: tripErr } = await db
    .from("trips")
    .update({ client_amount: client, driver_amount: driverAmount, margin, km_billable: km, calculation_metadata: metadata })
    .eq("id", input.tripId)
    .eq("tenant_id", input.tenantId);
  if (tripErr) throw new Error(tripErr.message);

  const { error: finErr } = await db.from("trip_financials").upsert(
    {
      trip_id: input.tripId,
      amount_client: client,
      amount_driver: driverAmount,
      tolls: 0,
      parking: 0,
      extras: 0,
      discount: 0,
      net_margin: margin,
      pricing_rule_id: null,
      calculation_metadata: metadata
    },
    { onConflict: "trip_id" }
  );
  if (finErr) throw new Error(finErr.message);

  await insertAuditEvent({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "finance.pricing_applied",
    entityType: "trip",
    entityId: input.tripId,
    metadata: { source: "categoria", detail: table.detail, amount_client: client, amount_driver: driverAmount }
  });
  return { applied: true, km_billable: km, amount_client: client, amount_driver: driverAmount };
}

/** Aplica regra de precificação do cliente e grava `trip_financials` + metadados na viagem. */
export async function applyTripPricingOnCompletion(
  input: ApplyTripPricingInput
): Promise<ApplyTripPricingResult> {
  {
    const [receivableLock, payableLock] = await Promise.all([
      db.from("accounts_receivable").select("status").eq("trip_id", input.tripId).eq("tenant_id", input.tenantId).maybeSingle(),
      db.from("driver_payables").select("status").eq("trip_id", input.tripId).eq("tenant_id", input.tenantId).maybeSingle()
    ]);
    const locked =
      financialTitleBlocksRegeneration(receivableLock.data?.status as string | undefined) ||
      financialTitleBlocksRegeneration(payableLock.data?.status as string | undefined);
    if (!locked) {
      const byCategory = await applyCategoryPricing(input);
      if (byCategory) return byCategory;
    }
  }

  const { data: tripRow } = await db
    .from("trips")
    .select("driver_id, service_type, scheduled_at, wait_minutes, client_amount, driver_amount")
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

  const computed = calculateTripPricing(rule, pricingInput);

  // Transfer e diária são orçados pela central: o valor digitado na corrida vale mais que a tabela.
  // Sem valor na corrida e tabela zerada, não grava zero (a fatura acusa "sem valor").
  const isQuotedService = Boolean(serviceKey) && !String(serviceKey).startsWith("corporativo");
  const quotedClient = Number(tripRow?.client_amount) || 0;
  const quotedDriver = Number(tripRow?.driver_amount) || 0;
  if (isQuotedService && quotedClient <= 0 && !(computed.amount_client > 0)) {
    return { applied: false, skipped_reason: "valor_a_combinar_sem_valor" };
  }
  const baseResult =
    isQuotedService && quotedClient > 0
      ? {
          ...computed,
          amount_client: roundMoney(quotedClient),
          amount_driver: roundMoney(quotedDriver > 0 ? quotedDriver : computed.amount_driver),
          net_margin: roundMoney(quotedClient - (quotedDriver > 0 ? quotedDriver : computed.amount_driver)),
          breakdown: { ...computed.breakdown, source: "valor_orcado_na_corrida" }
        }
      : computed;

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
