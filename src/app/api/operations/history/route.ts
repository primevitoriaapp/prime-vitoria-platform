import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { resolveProfileNames } from "@/lib/profiles/resolve-profile-names";
import { buildOperationsHistoryCsv, type HistoryCsvRow } from "@/lib/operations/history-csv";
import {
  OPERATIONS_HISTORY_STATUSES,
  parseOperationsHistoryQuery
} from "@/lib/operations/operations-history-query";

const HISTORY_EXPORT_MAX = 500;

function tripHistoryUpdatedAt(trip: {
  approved_at?: string | null;
  km_updated_at?: string | null;
  created_at?: string | null;
}): string | null {
  return trip.approved_at ?? trip.km_updated_at ?? trip.created_at ?? null;
}

async function enrichWithDriverNames(
  tenantId: string,
  trips: { id: string; driver_id: string | null }[]
): Promise<Record<string, string>> {
  const driverIds = [...new Set(trips.map((t) => t.driver_id).filter((id): id is string => Boolean(id)))];
  let driverNames: Record<string, string> = {};
  if (driverIds.length) {
    const { data: drivers } = await db.from("drivers").select("id, profile_id").in("id", driverIds);
    const profileNames = await resolveProfileNames((drivers ?? []).map((d) => d.profile_id));
    for (const d of drivers ?? []) {
      const name = profileNames[d.profile_id];
      if (name) driverNames[d.id] = name;
    }
  }
  return driverNames;
}

function baseHistoryQuery(
  tenantId: string,
  q: ReturnType<typeof parseOperationsHistoryQuery>,
  sinceIso: string
) {
  const statuses = q.status ? [q.status] : [...OPERATIONS_HISTORY_STATUSES];

  let query = db
    .from("trips")
    .select(
      "id, scheduled_at, operational_status, client_id, driver_id, passenger_name, origin_text, destination_text, planned_km, actual_km, created_at, approved_at, km_updated_at",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .in("operational_status", statuses)
    .gte("scheduled_at", sinceIso)
    .order("scheduled_at", { ascending: false });

  if (q.client_id) query = query.eq("client_id", q.client_id);
  if (q.driver_id) query = query.eq("driver_id", q.driver_id);
  if (q.scheduled_to) query = query.lte("scheduled_at", q.scheduled_to);
  return query;
}

/** Histórico operacional recente (viagens encerradas). `format=csv` exporta até 500 linhas com os mesmos filtros. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    if (session.role !== "admin" && session.role !== "operador") {
      return fail("FORBIDDEN", "Histórico reservado a admin e operador", 403);
    }
    const tenantId = assertTenantScope(session);
    const q = parseOperationsHistoryQuery(new URL(request.url).searchParams);

    const since = new Date();
    since.setDate(since.getDate() - q.days);
    const sinceIso = since.toISOString();

    if (q.format === "csv") {
      const { data: trips, error } = await baseHistoryQuery(tenantId, q, sinceIso).limit(HISTORY_EXPORT_MAX);
      if (error) return fail("HISTORY_EXPORT_FAILED", error.message, 500);
      const driverNames = await enrichWithDriverNames(tenantId, trips ?? []);
      const rows: HistoryCsvRow[] = (trips ?? []).map((t) => ({
        id: t.id as string,
        scheduled_at: t.scheduled_at as string,
        operational_status: t.operational_status as string,
        client_id: (t.client_id as string | null) ?? null,
        driver_id: (t.driver_id as string | null) ?? null,
        driver_name: t.driver_id ? (driverNames[t.driver_id as string] ?? null) : null,
        passenger_name: (t.passenger_name as string | null) ?? null,
        origin_text: t.origin_text as string,
        destination_text: t.destination_text as string,
        planned_km: t.planned_km != null ? Number(t.planned_km) : null,
        actual_km: t.actual_km != null ? Number(t.actual_km) : null,
        updated_at: tripHistoryUpdatedAt({
          approved_at: t.approved_at as string | null,
          km_updated_at: t.km_updated_at as string | null,
          created_at: t.created_at as string | null
        })
      }));
      const csv = buildOperationsHistoryCsv(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="historico-operacional.csv"'
        }
      });
    }

    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    const { data: trips, error, count } = await baseHistoryQuery(tenantId, q, sinceIso).range(from, to);

    if (error) return fail("HISTORY_LIST_FAILED", error.message, 500);

    const driverNames = await enrichWithDriverNames(tenantId, trips ?? []);

    const items = (trips ?? []).map((t) => {
      const { created_at, approved_at, km_updated_at, ...rest } = t;
      return {
        ...rest,
        updated_at: tripHistoryUpdatedAt({
          approved_at: approved_at as string | null,
          km_updated_at: km_updated_at as string | null,
          created_at: created_at as string | null
        }),
        driver_name: t.driver_id ? (driverNames[t.driver_id as string] ?? null) : null
      };
    });

    return ok({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0,
      days: q.days,
      scheduled_to: q.scheduled_to ?? null
    });
  } catch (error) {
    return mapApiError(error);
  }
}
