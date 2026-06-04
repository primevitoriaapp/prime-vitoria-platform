import {
  getClientPricingRule,
  listClientPricingRules,
  upsertClientPricingRule,
  type ClientPricingRuleInput,
  type ClientPricingRuleRow
} from "@/lib/clients/client-pricing-rules";

export type ClientPricingConfigRow = ClientPricingRuleRow;
export type ClientPricingConfigInput = ClientPricingRuleInput;

export async function getClientPricingConfig(
  clientId: string,
  tenantId: string,
  serviceType = "default"
): Promise<ClientPricingConfigRow | null> {
  return getClientPricingRule(clientId, tenantId, serviceType);
}

export async function upsertClientPricingConfig(
  clientId: string,
  tenantId: string,
  body: ClientPricingConfigInput
): Promise<{ data: ClientPricingConfigRow | null; error: Error | null }> {
  return upsertClientPricingRule(clientId, tenantId, body);
}

export { listClientPricingRules };
