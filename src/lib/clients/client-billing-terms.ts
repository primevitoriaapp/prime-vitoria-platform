import { db } from "@/lib/server/db";
import {
  emptyClientBillingTerms,
  type BillingIssuer,
  type ClientBillingTerms
} from "@/lib/clients/billing-terms-calc";

export * from "@/lib/clients/billing-terms-calc";

const COLUMNS =
  "wait_tolerance_minutes, wait_client_price_per_hour, wait_driver_price_per_hour, payment_term_days, billing_issuer, invoice_closing_day, invoice_auto_close, invoiced";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getClientBillingTerms(clientId: string, tenantId: string): Promise<ClientBillingTerms> {
  const { data, error } = await db
    .from("clients")
    .select(COLUMNS)
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return emptyClientBillingTerms();
  const row = data as Record<string, unknown>;
  return {
    wait_tolerance_minutes: num(row.wait_tolerance_minutes) ?? 15,
    wait_client_price_per_hour: num(row.wait_client_price_per_hour),
    wait_driver_price_per_hour: num(row.wait_driver_price_per_hour),
    payment_term_days: num(row.payment_term_days),
    billing_issuer: (row.billing_issuer as BillingIssuer | null) ?? null,
    invoice_closing_day: num(row.invoice_closing_day) ?? 0,
    invoice_auto_close: row.invoice_auto_close !== false,
    invoiced: row.invoiced !== false
  };
}

export async function updateClientBillingTerms(
  clientId: string,
  tenantId: string,
  terms: ClientBillingTerms
): Promise<{ data: ClientBillingTerms | null; error: Error | null }> {
  const { error } = await db
    .from("clients")
    .update({
      wait_tolerance_minutes: terms.wait_tolerance_minutes,
      wait_client_price_per_hour: terms.wait_client_price_per_hour,
      wait_driver_price_per_hour: terms.wait_driver_price_per_hour,
      payment_term_days: terms.payment_term_days,
      billing_issuer: terms.billing_issuer,
      invoice_closing_day: terms.invoice_closing_day,
      invoice_auto_close: terms.invoice_auto_close,
      invoiced: terms.invoiced
    })
    .eq("id", clientId)
    .eq("tenant_id", tenantId);
  if (error) return { data: null, error: new Error(error.message) };
  return { data: await getClientBillingTerms(clientId, tenantId), error: null };
}
