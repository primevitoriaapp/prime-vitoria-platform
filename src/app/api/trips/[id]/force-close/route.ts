import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runBestEffort } from "@/lib/server/best-effort";
import { runPostTripAutomationSafely } from "@/lib/trips/post-trip-automation";

const bodySchema = z.object({
  action: z.enum(["completed", "cancelled"]),
  reason: z.string().trim().min(3).max(300),
  actual_km: z.coerce.number().positive().max(5000).optional()
});

const OPEN = ["dispatched", "accepted", "reassigned", "on_the_way", "arrived", "in_progress", "approved", "requested"];

/** A central encerra uma corrida que ficou esquecida aberta (realizada ou cancelada), com motivo registrado. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const { data: trip } = await db.from("trips").select("id, operational_status, driver_id, scheduled_at, planned_km, actual_km").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (!OPEN.includes(trip.operational_status as string)) return fail("INVALID_STATUS", "Esta corrida já está encerrada.", 409);
    if (body.action === "completed" && Date.parse(trip.scheduled_at as string) > Date.now()) return fail("FUTURE_TRIP", "Corrida ainda não aconteceu.", 409);

    await db.rpc("set_trip_status_audit_context", { p_source: "admin", p_changed_by: session.userId });
    const update: Record<string, unknown> = { operational_status: body.action };
    if (body.action === "cancelled") update.cancel_reason = body.reason;
    if (body.action === "completed" && trip.actual_km == null) {
      const km = body.actual_km ?? (trip.planned_km != null ? Number(trip.planned_km) : null);
      if (km != null) {
        update.actual_km = km;
        update.km_source = "manual";
        update.km_updated_at = new Date().toISOString();
      }
    }
    const { error } = await db.from("trips").update(update).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("UPDATE_FAILED", error.message, 500);

    if (trip.driver_id) {
      const { count } = await db
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("driver_id", trip.driver_id)
        .in("operational_status", ["on_the_way", "arrived", "in_progress"]);
      if (!count) await db.from("drivers").update({ operational_status: "online", operational_status_updated_at: new Date().toISOString() }).eq("id", trip.driver_id);
    }
    await runBestEffort("trip.force_close.track_expire", async () => {
      await db.from("trip_public_track_tokens").update({ expires_at: new Date(Date.now() + 3 * 3600000).toISOString() }).eq("trip_id", id).gt("expires_at", new Date().toISOString());
    });
    if (body.action === "completed") await runPostTripAutomationSafely({ tripId: id, tenantId, actorUserId: session.userId });

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.force_close",
      entityType: "trip",
      entityId: id,
      metadata: { from: trip.operational_status, to: body.action, reason: body.reason },
      request
    });
    return ok({ id, status: body.action });
  } catch (error) {
    return mapApiError(error);
  }
}
