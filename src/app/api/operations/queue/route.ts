import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { resolveProfileNames } from "@/lib/profiles/resolve-profile-names";
import { parseOperationsQueueQuery } from "@/lib/operations/operations-queue-query";

const ACTIVE_STATUSES = ["requested", "approved", "dispatched", "accepted", "on_the_way", "arrived", "in_progress"];

/** Máximo de viagens lidas da BD quando `unclaimedOnly=true` (filtro depois em memória + paginação). */
const UNCLAIMED_SCAN_LIMIT = 300;

function buildTripQuery(
  tenantId: string,
  q: ReturnType<typeof parseOperationsQueueQuery>
) {
  let tripQuery = db
    .from("trips")
    .select(
      "id, scheduled_at, operational_status, client_id, driver_id, passenger_name, origin_text, destination_text, planned_km, actual_km",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .in("operational_status", ACTIVE_STATUSES);

  if (q.client_id) tripQuery = tripQuery.eq("client_id", q.client_id);
  if (q.driver_id) tripQuery = tripQuery.eq("driver_id", q.driver_id);
  if (q.scheduled_from) tripQuery = tripQuery.gte("scheduled_at", q.scheduled_from);
  if (q.scheduled_to) tripQuery = tripQuery.lte("scheduled_at", q.scheduled_to);
  return tripQuery;
}

async function mapTripsWithClaims(
  tenantId: string,
  trips: {
    id: string;
    scheduled_at: string;
    operational_status: string;
    client_id?: string | null;
    driver_id?: string | null;
    passenger_name?: string | null;
    origin_text: string;
    destination_text: string;
    planned_km?: unknown;
    actual_km?: unknown;
  }[]
) {
  const tripIds = trips.map((t) => t.id as string);
  let claimsByTrip: Record<string, { operator_profile_id: string; claimed_at: string }> = {};

  if (tripIds.length > 0) {
    const { data: claims } = await db
      .from("trip_operational_claims")
      .select("trip_id, operator_profile_id, claimed_at")
      .eq("tenant_id", tenantId)
      .in("trip_id", tripIds)
      .is("released_at", null);

    claimsByTrip = Object.fromEntries(
      (claims ?? []).map((c) => [
        c.trip_id as string,
        { operator_profile_id: c.operator_profile_id as string, claimed_at: c.claimed_at as string }
      ])
    );
  }

  const profileIds = Object.values(claimsByTrip).map((c) => c.operator_profile_id);
  const profileNames = await resolveProfileNames(profileIds);

  return trips.map((t) => {
    const claim = claimsByTrip[t.id as string];
    return {
      ...t,
      claim: claim
        ? {
            ...claim,
            operator_name: profileNames[claim.operator_profile_id] ?? null
          }
        : null
    };
  });
}

/** Fila operacional: viagens activas com estado de multiatendimento (claim). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    if (session.role !== "admin" && session.role !== "operador") {
      return fail("FORBIDDEN", "Fila operacional reservada a admin e operador", 403);
    }
    const tenantId = assertTenantScope(session);
    const q = parseOperationsQueueQuery(new URL(request.url).searchParams);

    const tripQuery = buildTripQuery(tenantId, q);

    if (q.unclaimedOnly) {
      const { data: trips, error } = await tripQuery.order("scheduled_at", { ascending: true }).limit(UNCLAIMED_SCAN_LIMIT);
      if (error) return fail("QUEUE_LIST_FAILED", error.message, 500);

      const itemsWithClaims = await mapTripsWithClaims(tenantId, trips ?? []);
      const unclaimed = itemsWithClaims.filter((t) => !t.claim);
      const total = unclaimed.length;
      const from = (q.page - 1) * q.pageSize;
      const pageItems = unclaimed.slice(from, from + q.pageSize);

      return ok({
        items: pageItems,
        page: q.page,
        pageSize: q.pageSize,
        total,
        filtered_count: pageItems.length,
        unclaimed_scan_limit: UNCLAIMED_SCAN_LIMIT
      });
    }

    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    const { data: trips, error, count } = await tripQuery.order("scheduled_at", { ascending: true }).range(from, to);

    if (error) return fail("QUEUE_LIST_FAILED", error.message, 500);

    const items = await mapTripsWithClaims(tenantId, trips ?? []);

    return ok({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0,
      filtered_count: items.length
    });
  } catch (error) {
    return mapApiError(error);
  }
}
