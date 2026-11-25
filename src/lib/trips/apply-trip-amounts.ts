import { db } from "@/lib/server/db";
import { ensureDriverPayableFromTripFinancials } from "@/lib/finance/ensure-driver-payable";
import { ensureAccountsReceivableFromTripFinancials } from "@/lib/finance/ensure-accounts-receivable";

/**
 * Grava quanto o cliente paga e quanto o motorista recebe numa corrida e, se ela já foi concluída,
 * ajusta o financeiro (títulos ainda não pagos). `keepWait`: false zera a espera calculada pelo app.
 */
export async function applyTripAmounts(
  tenantId: string,
  tripId: string,
  client: number | null,
  driver: number | null,
  opts: { clearWait?: boolean } = {}
) {
  const { data: trip } = await db
    .from("trips")
    .select("id, operational_status, calculation_metadata")
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!trip) throw new Error("Corrida não encontrada");
  const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  client = r2(client);
  driver = r2(driver);
  const margin = client != null && driver != null ? r2(client - driver) : client;
  const meta = trip.calculation_metadata && typeof trip.calculation_metadata === "object" ? (trip.calculation_metadata as Record<string, unknown>) : null;

  const { data: updated, error } = await db
    .from("trips")
    .update({
      client_amount: client,
      driver_amount: driver,
      margin,
      // Valor gravado é o total fechado: a espera antiga não pode ser somada de novo num recálculo.
      ...(meta ? { calculation_metadata: { ...meta, ...(opts.clearWait !== false ? { wait: undefined } : {}), valor_digitado: true } } : {})
    })
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .select("id, client_amount, driver_amount, margin")
    .single();
  if (error) throw new Error(error.message);

  if (trip.operational_status === "completed") {
    await db.from("trip_financials").upsert({ trip_id: tripId, amount_client: client ?? 0, amount_driver: driver ?? 0, net_margin: margin ?? 0 }, { onConflict: "trip_id" });
    if (client != null) await db.from("accounts_receivable").update({ amount: client }).eq("trip_id", tripId).eq("tenant_id", tenantId).neq("status", "paid");
    if (driver != null) await db.from("driver_payables").update({ amount: driver }).eq("trip_id", tripId).eq("tenant_id", tenantId).neq("status", "paid");
    if (driver != null && driver > 0) await ensureDriverPayableFromTripFinancials(tripId, tenantId).catch(() => undefined);
    if (client != null && client > 0) await ensureAccountsReceivableFromTripFinancials(tripId, tenantId).catch(() => undefined);
  }
  return updated;
}
