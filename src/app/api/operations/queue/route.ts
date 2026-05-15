import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { resolveProfileNames } from "@/lib/profiles/resolve-profile-names";

const ACTIVE_STATUSES = ["requested", "approved", "dispatched", "accepted", "on_the_way", "arrived", "in_progress"];

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  unclaimedOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true")
});

/** Fila operacional: viagens activas com estado de multiatendimento (claim). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    if (session.role !== "admin" && session.role !== "operador") {
      return fail("FORBIDDEN", "Fila operacional reservada a admin e operador", 403);
    }
    const tenantId = assertTenantScope(session);
    const q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    const { data: trips, error, count } = await db
      .from("trips")
      .select(
        "id, scheduled_at, operational_status, client_id, driver_id, passenger_name, origin_text, destination_text, planned_km, actual_km",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .in("operational_status", ACTIVE_STATUSES)
      .order("scheduled_at", { ascending: true })
      .range(from, to);

    if (error) return fail("QUEUE_LIST_FAILED", error.message, 500);

    const tripIds = (trips ?? []).map((t) => t.id as string);
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

    let items = (trips ?? []).map((t) => {
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

    if (q.unclaimedOnly) {
      items = items.filter((t) => !t.claim);
    }

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
