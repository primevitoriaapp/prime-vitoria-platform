import { db } from "../server/db";

export type ClosingAggregate = {
  entity_type: "client" | "driver";
  entity_id: string;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
};

type TripFinancialRow = {
  amount_client: number;
  amount_driver: number;
  tolls: number;
  parking: number;
  net_margin: number;
};

/** Agrega `trip_financials` por cliente e motorista no período (viagens agendadas do tenant). */
export async function aggregateClosingsForPeriod(
  tenantId: string,
  periodStart: string,
  periodEnd: string
): Promise<ClosingAggregate[]> {
  const endIso = periodEnd.length === 10 ? `${periodEnd}T23:59:59.999Z` : periodEnd;

  const { data: trips, error } = await db
    .from("trips")
    .select(
      "id, client_id, driver_id, trip_financials(amount_client, amount_driver, tolls, parking, net_margin)"
    )
    .eq("tenant_id", tenantId)
    .gte("scheduled_at", periodStart)
    .lte("scheduled_at", endIso);

  if (error) {
    throw new Error(error.message);
  }

  const clients = new Map<string, ClosingAggregate>();
  const drivers = new Map<string, ClosingAggregate>();

  for (const trip of trips ?? []) {
    const raw = trip.trip_financials as TripFinancialRow | TripFinancialRow[] | null;
    const tf = Array.isArray(raw) ? raw[0] : raw;
    if (!tf) continue;

    const amountClient = Number(tf.amount_client) || 0;
    const amountDriver = Number(tf.amount_driver) || 0;
    const tolls = Number(tf.tolls) || 0;
    const parking = Number(tf.parking) || 0;
    const netMargin = Number(tf.net_margin) || 0;
    const tripCost = amountDriver + tolls + parking;

    const clientId = trip.client_id as string;
    const c = clients.get(clientId) ?? {
      entity_type: "client" as const,
      entity_id: clientId,
      gross_amount: 0,
      cost_amount: 0,
      margin_amount: 0
    };
    c.gross_amount += amountClient;
    c.cost_amount += tripCost;
    c.margin_amount += netMargin;
    clients.set(clientId, c);

    const driverId = trip.driver_id as string | null;
    if (driverId) {
      const d = drivers.get(driverId) ?? {
        entity_type: "driver" as const,
        entity_id: driverId,
        gross_amount: 0,
        cost_amount: 0,
        margin_amount: 0
      };
      d.gross_amount += amountDriver;
      d.cost_amount += tolls + parking;
      d.margin_amount += amountDriver;
      drivers.set(driverId, d);
    }
  }

  return [...clients.values(), ...drivers.values()];
}

export async function upsertDraftClosings(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
  aggregates: ClosingAggregate[]
): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;
  for (const row of aggregates) {
    const { data: existing } = await db
      .from("financial_closings")
      .select("status")
      .eq("tenant_id", tenantId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .eq("entity_type", row.entity_type)
      .eq("entity_id", row.entity_id)
      .maybeSingle();

    if (existing?.status === "closed") {
      skipped += 1;
      continue;
    }

    const { error } = await db.from("financial_closings").upsert(
      {
        tenant_id: tenantId,
        period_start: periodStart,
        period_end: periodEnd,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        gross_amount: roundMoney(row.gross_amount),
        cost_amount: roundMoney(row.cost_amount),
        margin_amount: roundMoney(row.margin_amount),
        status: existing?.status === "reopened" ? "reopened" : "draft"
      },
      { onConflict: "tenant_id,period_start,period_end,entity_type,entity_id" }
    );
    if (error) {
      throw new Error(error.message);
    }
    written += 1;
  }
  return { written, skipped };
}


function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
