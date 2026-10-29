import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Corridas que já passaram há mais de 12 h e não foram finalizadas nem canceladas. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { data, error } = await db
      .from("trips")
      .select("id, scheduled_at, operational_status, origin_text, destination_text, passenger_name, client_id, driver_id, client_amount, planned_km")
      .eq("tenant_id", tenantId)
      .in("operational_status", ["dispatched", "accepted", "on_the_way", "arrived", "in_progress"])
      .lt("scheduled_at", new Date(Date.now() - 12 * 3600000).toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(100);
    if (error) return fail("LIST_FAILED", error.message, 500);
    const rows = data ?? [];
    const cIds = [...new Set(rows.map((r) => r.client_id as string).filter(Boolean))];
    const dIds = [...new Set(rows.map((r) => r.driver_id as string).filter(Boolean))];
    const [{ data: cs }, { data: ds }] = await Promise.all([
      cIds.length ? db.from("clients").select("id, name, trade_name").in("id", cIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      dIds.length ? db.from("drivers").select("id, full_name").in("id", dIds) : Promise.resolve({ data: [] as Record<string, unknown>[] })
    ]);
    const cn = new Map((cs ?? []).map((c) => [c.id as string, ((c.trade_name as string) || (c.name as string)) ?? "Cliente"]));
    const dn = new Map((ds ?? []).map((d) => [d.id as string, (d.full_name as string) ?? "Motorista"]));
    return ok(rows.map((r) => ({ ...r, client_name: cn.get(r.client_id as string) ?? "Cliente", driver_name: dn.get(r.driver_id as string) ?? null })));
  } catch (error) {
    return mapApiError(error);
  }
}
