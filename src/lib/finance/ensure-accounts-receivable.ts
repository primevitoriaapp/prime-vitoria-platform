import { db } from "@/lib/server/db";
import { accountsReceivableAmountFromFinancial } from "@/lib/finance/accounts-receivable-amount";
import { getClientBillingTerms, receivableDueDate } from "@/lib/clients/client-billing-terms";
import { driverPayoutDateForTrip } from "@/lib/finance/driver-payout-sync";
import { prepaidByTrip } from "@/lib/finance/booking-payments";

/** Cria conta a receber a partir de `trip_financials.amount_client` se a viagem está concluída e ainda não existe título. */
export async function ensureAccountsReceivableFromTripFinancials(
  tripId: string,
  tenantId: string
): Promise<{ created: boolean; receivable_id?: string }> {
  const { data: trip } = await db
    .from("trips")
    .select("client_id, operational_status")
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!trip?.client_id || trip.operational_status !== "completed") {
    return { created: false };
  }

  const { data: existing } = await db.from("accounts_receivable").select("id").eq("trip_id", tripId).maybeSingle();

  if (existing?.id) return { created: false, receivable_id: existing.id };

  const { data: tf } = await db
    .from("trip_financials")
    .select("amount_client")
    .eq("trip_id", tripId)
    .maybeSingle();

  const amount = accountsReceivableAmountFromFinancial(tf?.amount_client);
  if (amount == null) return { created: false };

  // Vencimento pelo prazo do cliente (cadastro → Cobrança); sem prazo, 30 dias.
  // Faturado: vence no fechamento + prazo; não faturado: no dia da corrida.
  const forecast = await driverPayoutDateForTrip(tripId).catch(() => null);
  const terms = forecast ? null : await getClientBillingTerms(trip.client_id as string, tenantId);
  const dueDate = forecast?.clientDue ?? receivableDueDate(terms?.payment_term_days);
  const issueDate = new Date().toISOString().slice(0, 10);

  const { data: inserted, error } = await db
    .from("accounts_receivable")
    .insert({
      trip_id: tripId,
      tenant_id: tenantId,
      client_id: trip.client_id,
      amount,
      issue_date: issueDate,
      due_date: dueDate,
      status: "open"
    })
    .select("id")
    .single();

  if (error || !inserted) return { created: false };
  await syncPrepaidReceivables(tenantId, [tripId]).catch(() => undefined);

  return { created: true, receivable_id: inserted.id as string };
}

/**
 * Pagamento antecipado (sinal / na reserva): a conta a receber da corrida já quitada pelo sinal
 * fica como paga; a parcialmente coberta continua aberta, com a anotação do valor já recebido.
 */
export async function syncPrepaidReceivables(tenantId: string, tripIds: string[]): Promise<void> {
  if (!tripIds.length) return;
  const alloc = await prepaidByTrip(tenantId, tripIds);
  const { data: rows } = await db
    .from("accounts_receivable")
    .select("id, trip_id, amount, status")
    .eq("tenant_id", tenantId)
    .in("trip_id", tripIds)
    .eq("status", "open");
  for (const r of rows ?? []) {
    const pre = alloc.get(r.trip_id as string) ?? 0;
    if (pre <= 0) continue;
    const amount = Number(r.amount);
    if (pre >= amount - 0.01) {
      await db
        .from("accounts_receivable")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: "antecipado", reference: "Pago antecipado na reserva" })
        .eq("id", r.id as string);
    } else {
      const brl = pre.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      await db.from("accounts_receivable").update({ reference: `Sinal ${brl} já recebido na reserva` }).eq("id", r.id as string);
    }
  }
}
