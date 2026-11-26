import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runPostTripAutomationSafely } from "@/lib/trips/post-trip-automation";
import { driverOperationalStatusForTrip } from "@/lib/drivers/operational-status";
import { closeAllDropoffs, parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";

const schema = z.object({
  actual_km: z.coerce.number().min(0).max(5000).optional().nullable(),
  reason: z.string().trim().max(300).optional().nullable()
});

const OPEN = ["approved", "dispatched", "accepted", "on_the_way", "arrived", "in_progress", "reassigned"];

/**
 * A central confirma que a corrida foi feita, quando o motorista não usou o app (sem sinal, celular, esqueceu).
 * Fecha a corrida sem mandar aviso ao passageiro e manda para "Aprovar corridas" (conferir KM e valores).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Só a central pode concluir por aqui", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = schema.parse(await request.json().catch(() => ({})));
    const { data: trip } = await db.from("trips").select("id, operational_status, driver_id, scheduled_at, review_reason, trip_dropoff_stops").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (!OPEN.includes(String(trip.operational_status))) return fail("INVALID_STATUS", "Esta corrida já está encerrada (concluída, cancelada ou no-show).", 409);
    if (!trip.driver_id) return fail("NO_DRIVER", "Defina o motorista que fez a corrida antes de concluir.", 409);
    if (new Date(String(trip.scheduled_at)).getTime() > Date.now() + 30 * 60000) return fail("FUTURE_TRIP", "Esta corrida ainda não aconteceu.", 409);

    const note = `Concluída pela central${b.reason ? `: ${b.reason}` : " (motorista não registrou no app)"}`;
    await db.rpc("set_trip_status_audit_context", { p_source: "admin", p_changed_by: session.userId });
    const drops = parseDropoffStops(trip.trip_dropoff_stops);
    const { error } = await db
      .from("trips")
      .update({
        operational_status: "completed",
        reviewed_at: null,
        review_required: true,
        review_reason: [trip.review_reason, note].filter(Boolean).join(" | "),
        ...(b.actual_km != null ? { actual_km: b.actual_km, km_source: "manual", km_updated_at: new Date().toISOString() } : {}),
        ...(drops.some((d) => !d.dropped_at) ? { trip_dropoff_stops: closeAllDropoffs(drops) } : {})
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) return fail("UPDATE_FAILED", error.message, 500);

    const ds = driverOperationalStatusForTrip("completed");
    if (ds) await db.from("drivers").update({ operational_status: ds, operational_status_updated_at: new Date().toISOString() }).eq("id", trip.driver_id as string).eq("tenant_id", tenantId);
    // Valor, contas a receber e repasse do motorista (igual ao fim pelo app). Sem aviso ao passageiro.
    await runPostTripAutomationSafely({ tripId: id, tenantId, actorUserId: session.userId });

    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "trip.completed_by_central", entityType: "trip", entityId: id, metadata: { de: trip.operational_status, km: b.actual_km ?? null, motivo: b.reason ?? null }, request });
    return ok({ completed: true });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", e.issues[0]?.message ?? "Dados inválidos", 400);
    return mapApiError(e);
  }
}
