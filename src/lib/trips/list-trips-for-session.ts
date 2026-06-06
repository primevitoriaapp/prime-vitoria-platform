import { db } from "@/lib/server/db";
import type { SessionContext } from "@/lib/domain/types";
import { AGENDA_OPERATIONAL_STATUSES } from "@/lib/operations/agenda-trip-statuses";
import { assertCapability, can } from "@/lib/security/rbac";
import { resolveCostCenterScopeForEmail } from "@/lib/clients/client-cost-centers";
import { driverBelongsToSession } from "@/lib/drivers/resolve-driver-for-session";
import { enrichTripListItems } from "@/lib/trips/enrich-trip-list";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { buildAgendaTripsSearchParams } from "@/lib/operations/agenda-trips-query";
import { parseTripsListQuery, tripsListQueryRange } from "@/lib/trips/trips-list-query";

export { buildAgendaTripsSearchParams };

type TripDbRow = {
  id: string;
  client_id: string;
  driver_id?: string | null;
  vehicle_id?: string | null;
  scheduled_at: string;
  operational_status?: string;
  [key: string]: unknown;
};

export type TripsListResult = {
  items: Awaited<ReturnType<typeof enrichTripListItems<TripDbRow>>>;
  page: number;
  pageSize: number;
  total: number;
};

function mergeTripsOutsideDateRange(
  merged: TripDbRow[],
  outsideRows: TripDbRow[] | null,
  sortAscending: boolean
): TripDbRow[] {
  const byId = new Map(merged.map((row) => [row.id as string, row]));
  for (const row of outsideRows ?? []) {
    byId.set(row.id as string, row);
  }
  return [...byId.values()].sort((a, b) => {
    const ta = new Date(a.scheduled_at as string).getTime();
    const tb = new Date(b.scheduled_at as string).getTime();
    return sortAscending ? ta - tb : tb - ta;
  });
}

async function fetchAllRequestedTrips(tenantId: string): Promise<TripDbRow[]> {
  const { data, error } = await db
    .from("trips")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("operational_status", "requested")
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (error) {
    console.warn("[trips list agenda] requested fetch failed", {
      tenantId,
      message: error.message
    });
    return [];
  }

  return (data ?? []) as TripDbRow[];
}

async function fetchAgendaTripsOutsideRange(
  tenantId: string,
  statuses: readonly string[],
  scheduledFromIso: string,
  scheduledToIso: string
): Promise<TripDbRow[]> {
  const fromMs = new Date(scheduledFromIso).getTime();
  const toMs = new Date(scheduledToIso).getTime();

  const { data: allOpen, error } = await db
    .from("trips")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("operational_status", [...statuses])
    .order("scheduled_at", { ascending: true })
    .limit(500);

  if (error) {
    console.warn("[trips list agenda] outside-range fetch failed", {
      tenantId,
      message: error.message
    });
    return [];
  }

  return (allOpen ?? []).filter((row) => {
    const t = new Date(row.scheduled_at as string).getTime();
    if (!Number.isFinite(t)) return false;
    return t < fromMs || t > toMs;
  }) as TripDbRow[];
}

/**
 * Lista corridas para a sessão actual (partilhado entre GET /api/trips e RSC da agenda).
 */
export async function listTripsForSession(
  session: SessionContext,
  searchParams: URLSearchParams
): Promise<TripsListResult> {
  const query = parseTripsListQuery(searchParams);
  const tenantId = assertTenantScope(session);
  const { scheduledFromIso, scheduledToIso } = tripsListQueryRange(query);
  const agendaMode = query.agenda && can(session, "trip.read");
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  const listLimit = agendaMode ? Math.min(query.pageSize, 500) : query.pageSize;

  let req = db.from("trips").select("*", { count: "exact" }).eq("tenant_id", tenantId);

  if (scheduledFromIso) req = req.gte("scheduled_at", scheduledFromIso);
  if (scheduledToIso) req = req.lte("scheduled_at", scheduledToIso);

  if (agendaMode) {
    req = req.in("operational_status", [...AGENDA_OPERATIONAL_STATUSES]);
  }

  const sortAscending = query.sortDir !== "desc";
  req = req.order("scheduled_at", { ascending: sortAscending });

  if (can(session, "trip.read")) {
    assertCapability(session, "trip.read");
    if (query.status) req = req.eq("operational_status", query.status);
    if (query.driverId) req = req.eq("driver_id", query.driverId);
    if (query.clientId) req = req.eq("client_id", query.clientId);
  } else if (can(session, "trip.read.own")) {
    assertCapability(session, "trip.read.own");
    if (!session.clientId) {
      throw new Error("Forbidden: Cliente precisa de escopo de cliente (x-client-id ou perfil)");
    }
    if (query.clientId && query.clientId !== session.clientId) {
      throw new Error("Forbidden: Nao e possivel listar viagens de outro cliente");
    }
    if (query.driverId) {
      throw new Error("Forbidden: Filtro nao permitido para este perfil");
    }
    req = req.eq("client_id", session.clientId);
    const scopedCenterId = await resolveCostCenterScopeForEmail(session.clientId, session.email);
    if (scopedCenterId) {
      req = req.eq("cost_center_id", scopedCenterId);
    }
    if (query.status) req = req.eq("operational_status", query.status);
  } else if (can(session, "trip.read.assigned")) {
    assertCapability(session, "trip.read.assigned");
    let driverId = session.driverId;

    if (query.driverId) {
      if (driverId && query.driverId !== driverId) {
        throw new Error("Forbidden: Nao e possivel listar viagens de outro motorista");
      }
      if (!driverId) {
        const allowed = await driverBelongsToSession(query.driverId, session);
        if (!allowed) {
          throw new Error("Forbidden: Nao e possivel listar viagens de outro motorista");
        }
        driverId = query.driverId;
      }
    }

    if (!driverId) {
      throw new Error(
        "Forbidden: Motorista precisa de cadastro vinculado (profile_id ou e-mail na ficha)"
      );
    }
    if (query.clientId) {
      throw new Error("Forbidden: Filtro nao permitido para este perfil");
    }
    req = req.eq("driver_id", driverId);
    if (query.status) req = req.eq("operational_status", query.status);
  } else {
    assertCapability(session, "trip.read");
  }

  const { data, error, count } = await req;

  if (error) {
    throw new Error(`TRIP_LIST_FAILED: ${error.message}`);
  }

  let merged = (data ?? []) as TripDbRow[];
  const mergeOpenStatuses =
    agendaMode || (query.includeAllRequested && can(session, "trip.read"));

  if (mergeOpenStatuses && can(session, "trip.read")) {
    const statuses = agendaMode ? [...AGENDA_OPERATIONAL_STATUSES] : (["requested"] as const);

    if (agendaMode) {
      const requestedRows = await fetchAllRequestedTrips(tenantId);
      merged = mergeTripsOutsideDateRange(merged, requestedRows, sortAscending);
    }

    if (scheduledFromIso && scheduledToIso) {
      const outsideStatuses = agendaMode
        ? statuses.filter((status) => status !== "requested")
        : statuses;
      if (outsideStatuses.length > 0) {
        const outsideRows = await fetchAgendaTripsOutsideRange(
          tenantId,
          outsideStatuses,
          scheduledFromIso,
          scheduledToIso
        );
        merged = mergeTripsOutsideDateRange(merged, outsideRows, sortAscending);
      }
    } else if (scheduledFromIso) {
      const { data: openRows } = await db
        .from("trips")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("operational_status", [...statuses])
        .lt("scheduled_at", scheduledFromIso)
        .order("scheduled_at", { ascending: sortAscending })
        .limit(500);
      merged = mergeTripsOutsideDateRange(merged, (openRows ?? []) as TripDbRow[], sortAscending);
    } else if (scheduledToIso) {
      const { data: openRows } = await db
        .from("trips")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("operational_status", [...statuses])
        .gt("scheduled_at", scheduledToIso)
        .order("scheduled_at", { ascending: sortAscending })
        .limit(500);
      merged = mergeTripsOutsideDateRange(merged, (openRows ?? []) as TripDbRow[], sortAscending);
    }
  }

  const items = await enrichTripListItems(merged);

  if (query.agenda) {
    console.log("[trips GET agenda]", {
      tenantId,
      role: session.role,
      userId: session.userId,
      agendaMode,
      scheduledFromIso,
      scheduledToIso,
      inRangeCount: data?.length ?? 0,
      mergedCount: merged.length,
      returnedCount: items.length,
      total: count ?? 0
    });
  }

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: count ?? 0
  };
}
