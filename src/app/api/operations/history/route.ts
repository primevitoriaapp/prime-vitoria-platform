import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { resolveProfileNames } from "@/lib/profiles/resolve-profile-names";

const HISTORY_STATUSES = ["completed", "cancelled", "no_show", "rejected"];

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  days: z.coerce.number().int().min(1).max(90).default(14),
  client_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  status: z.enum(["completed", "cancelled", "no_show", "rejected"]).optional()
});

/** Histórico operacional recente (viagens encerradas). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    if (session.role !== "admin" && session.role !== "operador") {
      return fail("FORBIDDEN", "Histórico reservado a admin e operador", 403);
    }
    const tenantId = assertTenantScope(session);
    const q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    const since = new Date();
    since.setDate(since.getDate() - q.days);

    const statuses = q.status ? [q.status] : HISTORY_STATUSES;

    let query = db
      .from("trips")
      .select(
        "id, scheduled_at, operational_status, client_id, driver_id, passenger_name, origin_text, destination_text, planned_km, actual_km, updated_at",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .in("operational_status", statuses)
      .gte("scheduled_at", since.toISOString())
      .order("scheduled_at", { ascending: false })
      .range(from, to);

    if (q.client_id) query = query.eq("client_id", q.client_id);
    if (q.driver_id) query = query.eq("driver_id", q.driver_id);

    const { data: trips, error, count } = await query;

    if (error) return fail("HISTORY_LIST_FAILED", error.message, 500);

    const driverIds = [...new Set((trips ?? []).map((t) => t.driver_id).filter((id): id is string => Boolean(id)))];
    let driverNames: Record<string, string> = {};
    if (driverIds.length) {
      const { data: drivers } = await db.from("drivers").select("id, profile_id").in("id", driverIds);
      const profileNames = await resolveProfileNames((drivers ?? []).map((d) => d.profile_id));
      for (const d of drivers ?? []) {
        const name = profileNames[d.profile_id];
        if (name) driverNames[d.id] = name;
      }
    }

    const items = (trips ?? []).map((t) => ({
      ...t,
      driver_name: t.driver_id ? (driverNames[t.driver_id] ?? null) : null
    }));

    return ok({
      items,
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0,
      days: q.days
    });
  } catch (error) {
    return mapApiError(error);
  }
}
