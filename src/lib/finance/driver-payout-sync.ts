import { db } from "@/lib/server/db";
import { clientDueDate, driverPayoutDateFromClientDue, nextBusinessDay, spDay, type ClientPaymentTerms } from "@/lib/finance/payout-schedule";

type TripRow = { id: string; client_id: string; scheduled_at: string; client_invoice_id: string | null };
type InvoiceRow = { id: string; due_date: string; status: string; paid_at: string | null };

const TERMS_COLS = "id, invoiced, invoice_closing_day, invoice_per_service, driver_paid_upfront, payment_term_days, reconciliation_business_days";

/**
 * Data prevista de pagamento ao motorista para cada corrida:
 * fatura paga → dia do pagamento + conciliação; fatura fechada → vencimento + conciliação;
 * ainda sem fatura → fechamento previsto + prazo + conciliação. Sempre dia útil.
 */
export async function driverPayoutDatesForTrips(trips: TripRow[]): Promise<Map<string, { clientDue: string; payout: string }>> {
  const out = new Map<string, { clientDue: string; payout: string }>();
  if (!trips.length) return out;
  const clientIds = [...new Set(trips.map((t) => t.client_id))];
  const invoiceIds = [...new Set(trips.map((t) => t.client_invoice_id).filter(Boolean) as string[])];
  const [{ data: clients }, { data: invoices }] = await Promise.all([
    db.from("clients").select(TERMS_COLS).in("id", clientIds),
    invoiceIds.length
      ? db.from("client_invoices").select("id, due_date, status, paid_at").in("id", invoiceIds)
      : Promise.resolve({ data: [] as InvoiceRow[] })
  ]);
  const termsBy = new Map(((clients ?? []) as (ClientPaymentTerms & { id: string })[]).map((c) => [c.id, c]));
  const invBy = new Map(((invoices ?? []) as InvoiceRow[]).map((i) => [i.id, i]));
  for (const t of trips) {
    const terms: ClientPaymentTerms = termsBy.get(t.client_id) ?? {};
    const inv = t.client_invoice_id ? invBy.get(t.client_invoice_id) : undefined;
    let clientDue: string;
    if (inv && inv.status === "paga" && inv.paid_at) clientDue = spDay(inv.paid_at);
    else if (inv && inv.status !== "cancelada" && inv.due_date) clientDue = inv.due_date;
    else clientDue = clientDueDate(spDay(t.scheduled_at), terms);
    const payout = terms.driver_paid_upfront
      ? nextBusinessDay(spDay(t.scheduled_at))
      : driverPayoutDateFromClientDue(clientDue, terms.reconciliation_business_days);
    out.set(t.id, { clientDue, payout });
  }
  return out;
}

export async function driverPayoutDateForTrip(tripId: string): Promise<{ clientDue: string; payout: string } | null> {
  const { data } = await db.from("trips").select("id, client_id, scheduled_at, client_invoice_id").eq("id", tripId).maybeSingle();
  if (!data) return null;
  const m = await driverPayoutDatesForTrips([data as TripRow]);
  return m.get(tripId) ?? null;
}

/** Recalcula a data prevista dos repasses em aberto (por cliente, por corridas ou todos do tenant). */
export async function resyncOpenDriverPayoutDates(
  tenantId: string,
  scope: { clientId?: string; tripIds?: string[] } = {}
): Promise<number> {
  let q = db.from("driver_payables").select("id, trip_id, due_date").eq("tenant_id", tenantId).eq("status", "open").limit(2000);
  if (scope.tripIds?.length) q = q.in("trip_id", scope.tripIds);
  const { data: payables } = await q;
  const rows = (payables ?? []) as { id: string; trip_id: string; due_date: string }[];
  if (!rows.length) return 0;
  let tq = db.from("trips").select("id, client_id, scheduled_at, client_invoice_id").in("id", rows.map((r) => r.trip_id));
  if (scope.clientId) tq = tq.eq("client_id", scope.clientId);
  const { data: trips } = await tq;
  const dates = await driverPayoutDatesForTrips((trips ?? []) as TripRow[]);
  let changed = 0;
  for (const r of rows) {
    const d = dates.get(r.trip_id);
    if (!d || d.payout === r.due_date) continue;
    await db.from("driver_payables").update({ due_date: d.payout }).eq("id", r.id);
    changed++;
  }
  return changed;
}
