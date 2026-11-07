import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { punctuality, rankOf, type DriverMonthStat } from "@/lib/drivers/driver-ranking";

/**
 * Ranking do mês para o motorista: só os números DELE e a posição.
 * Nunca devolve nome nem quantidade dos outros motoristas.
 */
export async function GET() {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só motorista", 403);
    const tenantId = assertTenantScope(session);
    const now = new Date();
    const ym = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
    const from = new Date(`${ym}-01T00:00:00-03:00`).toISOString();
    const { data: trips } = await db
      .from("trips")
      .select("id, driver_id, scheduled_at, presentation_minutes")
      .eq("tenant_id", tenantId)
      .eq("operational_status", "completed")
      .not("driver_id", "is", null)
      .gte("scheduled_at", from)
      .lte("scheduled_at", now.toISOString())
      .limit(5000);
    const list = trips ?? [];
    const arrivals = new Map<string, string>();
    for (let i = 0; i < list.length; i += 300) {
      const { data: h } = await db
        .from("trip_status_history")
        .select("trip_id, changed_at")
        .eq("to_status", "arrived")
        .in("trip_id", list.slice(i, i + 300).map((t) => t.id as string));
      for (const r of h ?? []) if (!arrivals.has(r.trip_id as string)) arrivals.set(r.trip_id as string, r.changed_at as string);
    }
    const by = new Map<string, DriverMonthStat>();
    for (const t of list) {
      const id = t.driver_id as string;
      const s = by.get(id) ?? { driver_id: id, trips: 0, on_time: 0, with_arrival: 0 };
      s.trips += 1;
      const arr = arrivals.get(t.id as string);
      if (arr) {
        s.with_arrival += 1;
        const pickup = Date.parse(t.scheduled_at as string) - Number(t.presentation_minutes ?? 0) * 60000;
        if (Date.parse(arr) <= pickup + 5 * 60000) s.on_time += 1; // tolerância de 5 min
      }
      by.set(id, s);
    }
    const mine = by.get(session.driverId) ?? { driver_id: session.driverId, trips: 0, on_time: 0, with_arrival: 0 };
    const { position, of } = rankOf([...by.values()], session.driverId);
    const month = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "long" });
    const { data: me } = await db.from("drivers").select("vehicle_category_ids").eq("id", session.driverId).maybeSingle();
    const catIds = ((me?.vehicle_category_ids as string[] | null) ?? []).filter(Boolean);
    const { data: cats } = catIds.length ? await db.from("vehicle_categories").select("name, sort").in("id", catIds) : { data: [] };
    const categories = (cats ?? []).sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0)).map((c) => String(c.name));
    return ok({ month, trips: mine.trips, position, of, punctuality: punctuality(mine), categories });
  } catch (e) {
    return mapApiError(e);
  }
}
