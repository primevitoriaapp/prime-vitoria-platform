import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { clientRefFromNotes } from "@/lib/trips/client-ref";

/** Corridas finalizadas esperando a aprovação da central (KM e valores conferidos). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await db
      .from("trips")
      .select(
        "id, scheduled_at, client_id, driver_id, service_mode, passenger_name, origin_text, destination_text, odometer_start, odometer_end, actual_km, km_billable, km_source, planned_km, wait_minutes, client_amount, driver_amount, review_required, review_reason, notes, timeline_overrides"
      )
      .eq("tenant_id", tenantId)
      .eq("operational_status", "completed")
      .is("reviewed_at", null)
      .gte("scheduled_at", since)
      .order("scheduled_at")
      .limit(200);
    if (error) return fail("LIST_FAILED", error.message, 500);
    const rows = data ?? [];
    const cIds = [...new Set(rows.map((r) => r.client_id as string))];
    const dIds = [...new Set(rows.map((r) => r.driver_id as string).filter(Boolean))];
    const [{ data: cs }, { data: ds }] = await Promise.all([
      cIds.length ? db.from("clients").select("id, name, trade_name").in("id", cIds) : Promise.resolve({ data: [] as { id: string; name: string; trade_name: string | null }[] }),
      dIds.length ? db.from("drivers").select("id, full_name").in("id", dIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] })
    ]);
    // Horários reais (app do motorista ou corrigidos pela central).
    const ids = rows.map((r) => r.id as string);
    const { data: hist } = ids.length
      ? await db.from("trip_status_history").select("trip_id, to_status, changed_at").in("trip_id", ids).in("to_status", ["arrived", "in_progress", "completed"]).order("changed_at")
      : { data: [] as { trip_id: string; to_status: string; changed_at: string }[] };
    const firstAt = new Map<string, string>();
    for (const h of hist ?? []) {
      const k = `${h.trip_id}|${h.to_status}`;
      if (!firstAt.has(k)) firstAt.set(k, h.changed_at as string);
    }
    const timeOf = (r: { id: unknown; timeline_overrides?: unknown }, status: string, key: string) =>
      ((r.timeline_overrides as Record<string, string> | null)?.[key] ?? firstAt.get(`${r.id}|${status}`)) || null;
    const cName = new Map((cs ?? []).map((c) => [c.id as string, ((c.trade_name as string | null) || (c.name as string)).trim()]));
    const dName = new Map((ds ?? []).map((d) => [d.id as string, (d.full_name as string | null) ?? "Motorista"]));
    return ok(
      rows.map((r) => {
        const start = r.odometer_start == null ? null : Number(r.odometer_start);
        const end = r.odometer_end == null ? null : Number(r.odometer_end);
        return {
          id: r.id,
          scheduled_at: r.scheduled_at,
          client: cName.get(r.client_id as string) ?? "Cliente",
          driver: r.driver_id ? (dName.get(r.driver_id as string) ?? "Motorista") : null,
          ref: clientRefFromNotes(r.notes as string | null),
          passenger: r.passenger_name,
          origin: r.origin_text,
          destination: r.destination_text,
          by_km: r.service_mode === "km",
          odometer_start: start,
          odometer_end: end,
          odometer_km: start != null && end != null && end > start ? Math.round((end - start) * 10) / 10 : null,
          billed_km: r.km_billable != null ? Number(r.km_billable) : r.actual_km != null ? Number(r.actual_km) : null,
          planned_km: r.planned_km != null ? Number(r.planned_km) : null,
          km_source: r.km_source,
          wait_minutes: Number(r.wait_minutes ?? 0) || 0,
          arrived_at: timeOf(r, "arrived", "local"),
          started_at: timeOf(r, "in_progress", "iniciada"),
          completed_at: timeOf(r, "completed", "finalizada"),
          client_amount: r.client_amount != null ? Number(r.client_amount) : null,
          driver_amount: r.driver_amount != null ? Number(r.driver_amount) : null,
          alert: r.review_required ? (r.review_reason as string | null) || "Pedir conferência" : null
        };
      })
    );
  } catch (error) {
    return mapApiError(error);
  }
}
