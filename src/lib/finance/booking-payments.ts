import { db } from "@/lib/server/db";
import { allocatePrepaid, summarizePackage, type BookingPayment, type PackageSummary, type PackageTrip } from "@/lib/finance/booking-payments-core";

const PAY_COLS = "id, trip_ids, amount, method, account, installments, fee_amount, paid_on, notes";

function toPayment(r: Record<string, unknown>): BookingPayment {
  return {
    id: r.id as string,
    trip_ids: (r.trip_ids as string[]) ?? [],
    amount: Number(r.amount),
    method: String(r.method ?? "outro"),
    account: (r.account as string | null) ?? null,
    installments: r.installments == null ? null : Number(r.installments),
    fee_amount: r.fee_amount == null ? null : Number(r.fee_amount),
    paid_on: String(r.paid_on),
    notes: (r.notes as string | null) ?? null
  };
}

/** Pagamentos que incluem alguma destas corridas. */
export async function paymentsForTrips(tenantId: string, tripIds: string[]): Promise<BookingPayment[]> {
  if (!tripIds.length) return [];
  const { data, error } = await db.from("booking_payments").select(PAY_COLS).eq("tenant_id", tenantId).overlaps("trip_ids", tripIds);
  if (error) return [];
  return (data ?? []).map((r) => toPayment(r as Record<string, unknown>));
}

/** Corridas do mesmo pacote (booking_group_id), incluindo as informadas. */
export async function groupTripIds(tenantId: string, tripIds: string[]): Promise<string[]> {
  const { data: own } = await db.from("trips").select("booking_group_id").eq("tenant_id", tenantId).in("id", tripIds);
  const groups = [...new Set((own ?? []).map((t) => t.booking_group_id as string | null).filter(Boolean))] as string[];
  if (!groups.length) return tripIds;
  const { data: sib } = await db.from("trips").select("id").eq("tenant_id", tenantId).in("booking_group_id", groups);
  return [...new Set([...tripIds, ...(sib ?? []).map((t) => t.id as string)])];
}

async function loadTrips(tripIds: string[]): Promise<PackageTrip[]> {
  if (!tripIds.length) return [];
  const { data } = await db.from("trips").select("id, scheduled_at, client_amount, operational_status").in("id", tripIds);
  return (data ?? [])
    .filter((t) => t.operational_status !== "cancelled" && t.operational_status !== "rejected")
    .map((t) => ({ id: t.id as string, scheduled_at: t.scheduled_at as string, client_amount: t.client_amount == null ? null : Number(t.client_amount) }));
}

/** Pacote da corrida (todas as corridas ligadas pelos pagamentos) e o resumo do que foi pago. */
export async function packageForTrip(tenantId: string, tripId: string): Promise<PackageSummary & { trip_ids: string[]; allocated_here: number }> {
  const group = await groupTripIds(tenantId, [tripId]);
  const payments = await paymentsForTrips(tenantId, group);
  const ids = [...new Set([...group, ...payments.flatMap((p) => p.trip_ids)])];
  const trips = await loadTrips(ids);
  const alloc = allocatePrepaid(trips, payments);
  return { ...summarizePackage(trips, payments), trip_ids: ids, allocated_here: alloc.get(tripId) ?? 0 };
}

/** Quanto do que foi pago antecipado cabe a cada corrida (para fatura e contas a receber). */
export async function prepaidByTrip(tenantId: string, tripIds: string[]): Promise<Map<string, number>> {
  const payments = await paymentsForTrips(tenantId, tripIds);
  if (!payments.length) return new Map();
  const all = [...new Set([...tripIds, ...payments.flatMap((p) => p.trip_ids)])];
  return allocatePrepaid(await loadTrips(all), payments);
}
