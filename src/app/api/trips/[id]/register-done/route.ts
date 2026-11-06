import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runPostTripAutomationSafely } from "@/lib/trips/post-trip-automation";

const schema = z.object({
  driver_id: z.string().uuid().nullable().optional(),
  started_at: z.string().datetime({ offset: true }),
  ended_at: z.string().datetime({ offset: true }),
  km: z.coerce.number().positive().max(5000).nullable().optional(),
  wait_minutes: z.coerce.number().int().min(0).max(1440).optional()
});

/**
 * Registra uma corrida que já aconteceu fora do app (ex.: feita antes de usar o sistema):
 * vira "concluída" com horários e KM informados, calcula os valores e cria a cobrança e o repasse.
 * Vai para "Aprovar corridas" como qualquer outra.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Só a central registra corrida já feita", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = schema.parse(await request.json().catch(() => ({})));
    if (new Date(b.ended_at) <= new Date(b.started_at)) return fail("VALIDATION_ERROR", "O término precisa ser depois do início.", 400);
    if (new Date(b.ended_at).getTime() > Date.now() + 5 * 60_000) return fail("VALIDATION_ERROR", "O término não pode ser no futuro.", 400);
    const { data: trip } = await db.from("trips").select("id, operational_status, driver_id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (["completed", "cancelled", "rejected"].includes(trip.operational_status as string)) return fail("ALREADY_CLOSED", "Esta corrida já está encerrada.", 409);
    const driverId = b.driver_id ?? (trip.driver_id as string | null);
    if (!driverId) return fail("DRIVER_REQUIRED", "Escolha o motorista que fez a corrida.", 400);
    const now = new Date().toISOString();
    const { error } = await db
      .from("trips")
      .update({
        driver_id: driverId,
        operational_status: "completed",
        ...(b.km ? { actual_km: b.km, km_source: "manual", km_updated_at: now } : {}),
        ...(b.wait_minutes !== undefined ? { wait_minutes: b.wait_minutes, wait_started_at: null } : {}),
        timeline_overrides: { local: b.started_at, iniciada: b.started_at, finalizada: b.ended_at },
        review_required: true,
        review_reason: "Corrida registrada depois de feita (fora do app): conferir KM e valores"
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.register_done",
      entityType: "trip",
      entityId: id,
      metadata: { motorista: driverId, inicio: b.started_at, fim: b.ended_at, km: b.km ?? null }
    }).catch(() => undefined);
    await runPostTripAutomationSafely({ tripId: id, tenantId, actorUserId: session.userId });
    const { data: after } = await db.from("trips").select("client_amount, driver_amount, km_billable").eq("id", id).maybeSingle();
    return ok({ id, client_amount: after?.client_amount ?? null, driver_amount: after?.driver_amount ?? null, km_billable: after?.km_billable ?? null });
  } catch (e) {
    return mapApiError(e);
  }
}
