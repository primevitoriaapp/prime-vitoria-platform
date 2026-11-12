import { db } from "@/lib/server/db";
import { clientRefFromNotes } from "@/lib/trips/client-ref";
import { summarizeInvoice, type InvoiceTripInput } from "@/lib/finance/client-invoice-calc";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Corridas de uma fatura com os valores editáveis (cliente e motorista). */
export async function listInvoiceTripAmounts(tenantId: string, invoiceId: string) {
  const { data } = await db
    .from("trips")
    .select("id, scheduled_at, passenger_name, origin_text, destination_text, notes, client_amount, driver_amount")
    .eq("tenant_id", tenantId)
    .eq("client_invoice_id", invoiceId)
    .order("scheduled_at");
  return (data ?? []).map((t) => ({
    id: t.id as string,
    scheduled_at: t.scheduled_at as string,
    passenger: (t.passenger_name as string | null) ?? null,
    ref: clientRefFromNotes(t.notes as string | null),
    origin: (t.origin_text as string | null) ?? "",
    destination: (t.destination_text as string | null) ?? "",
    client_amount: t.client_amount == null ? null : Number(t.client_amount),
    driver_amount: t.driver_amount == null ? null : Number(t.driver_amount)
  }));
}

/** Recalcula total, KM e quantidade da fatura a partir das corridas dela. */
export async function recomputeInvoiceTotals(tenantId: string, invoiceId: string) {
  const { data } = await db
    .from("trips")
    .select("id, client_amount, km_billable, actual_km, planned_km")
    .eq("tenant_id", tenantId)
    .eq("client_invoice_id", invoiceId);
  const s = summarizeInvoice((data ?? []) as unknown as InvoiceTripInput[]);
  await db.from("client_invoices").update({ total_amount: s.total_amount, total_km: s.total_km, trip_count: s.trip_count }).eq("id", invoiceId).eq("tenant_id", tenantId);
  return s;
}

/**
 * Corrige o valor de uma corrida que já está na fatura (ex.: diária lançada como transfer).
 * Atualiza a corrida, o financeiro dela, o "a receber", o repasse ainda não pago e o total da fatura.
 */
export async function editInvoiceTripAmounts(input: {
  tenantId: string;
  invoiceId: string;
  tripId: string;
  clientAmount: number;
  driverAmount?: number | null;
}) {
  const { data: inv } = await db.from("client_invoices").select("id, status").eq("id", input.invoiceId).eq("tenant_id", input.tenantId).maybeSingle();
  if (!inv) throw new Error("Fatura não encontrada");
  if (inv.status === "paga" || inv.status === "cancelada") throw new Error("Fatura paga ou cancelada não pode ser alterada.");
  const { data: t } = await db
    .from("trips")
    .select("id, client_amount, driver_amount, client_invoice_id")
    .eq("id", input.tripId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!t || t.client_invoice_id !== input.invoiceId) throw new Error("Esta corrida não está nesta fatura");

  const client = r2(input.clientAmount);
  const driver = input.driverAmount == null ? (t.driver_amount == null ? null : Number(t.driver_amount)) : r2(input.driverAmount);
  await db.from("trips").update({ client_amount: client, ...(driver != null ? { driver_amount: driver } : {}) }).eq("id", input.tripId);
  await db
    .from("trip_financials")
    .update({ amount_client: client, ...(driver != null ? { amount_driver: driver, net_margin: r2(client - driver) } : {}) })
    .eq("trip_id", input.tripId);
  await db.from("accounts_receivable").update({ amount: client }).eq("trip_id", input.tripId).eq("tenant_id", input.tenantId).neq("status", "paid");
  let payoutNote: string | null = null;
  if (driver != null) {
    const { data: pays } = await db.from("driver_payables").select("id, status").eq("trip_id", input.tripId).neq("status", "cancelled");
    const paid = (pays ?? []).some((p) => p.status === "paid");
    if (paid) payoutNote = "O repasse do motorista já foi pago: o valor dele não foi mudado no repasse.";
    else await db.from("driver_payables").update({ amount: driver }).eq("trip_id", input.tripId).neq("status", "cancelled");
  }
  const totals = await recomputeInvoiceTotals(input.tenantId, input.invoiceId);
  return {
    before: { client: t.client_amount == null ? null : Number(t.client_amount), driver: t.driver_amount == null ? null : Number(t.driver_amount) },
    after: { client, driver },
    invoice_total: totals.total_amount,
    sent: inv.status === "enviada",
    payout_note: payoutNote
  };
}
