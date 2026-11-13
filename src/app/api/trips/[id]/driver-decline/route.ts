import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runBestEffort } from "@/lib/server/best-effort";
import { pushToStaff } from "@/lib/push/web-push";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";

/** Antes de sair para buscar, o motorista ainda pode devolver a corrida para a central. */
const DECLINABLE = ["dispatched", "accepted", "approved", "reassigned"];

const bodySchema = z.object({ reason: z.string().trim().min(3).max(300) });

/** Motorista recusa a corrida: ela volta para a central sem motorista e a equipe é avisada na hora. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    assertCapability(session, "trip.status");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { reason } = bodySchema.parse(await request.json());

    const { data: trip } = await db
      .from("trips")
      .select("id, driver_id, operational_status, scheduled_at, origin_text")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (!session.driverId || trip.driver_id !== session.driverId) return fail("FORBIDDEN", "Esta corrida não está com você", 403);
    if (!DECLINABLE.includes(trip.operational_status as string)) {
      return fail("TOO_LATE_TO_DECLINE", "Você já saiu para buscar. Para desistir agora, ligue para a central.", 409);
    }

    const { data: drv } = await db.from("drivers").select("full_name").eq("id", session.driverId).maybeSingle();
    const name = String(drv?.full_name ?? "Motorista").split(" ")[0];

    await db.rpc("set_trip_status_audit_context", { p_source: "driver", p_changed_by: session.userId }).then(
      () => undefined,
      () => undefined
    );
    const { error } = await db
      .from("trips")
      .update({ driver_id: null, vehicle_id: null, operational_status: "approved", reassign_reason: `Motorista ${name} recusou: ${reason}` })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("driver_id", session.driverId);
    if (error) return fail("DECLINE_FAILED", error.message, 500);
    await runBestEffort("trip.passenger_notice_reset", async () => {
      const { resetConfirmationNotice } = await import("@/lib/messages/passenger-notify");
      await resetConfirmationNotice(id);
    });

    const when = new Date(String(trip.scheduled_at)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    await runBestEffort("trip.driver_decline_push", async () => {
      await pushToStaff(tenantId, {
        title: `⚠️ ${name} recusou a corrida de ${when}`,
        body: `${String(trip.origin_text ?? "").split(",")[0]} · motivo: ${reason}. A corrida voltou sem motorista — escolha outro.`,
        url: `${OFFICIAL_URLS.central}/agenda`,
        tag: `decline-${id}`
      });
    });
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.driver_decline",
      entityType: "trip",
      entityId: id,
      metadata: { driver_id: session.driverId, from: trip.operational_status, reason },
      request
    });
    return ok({ declined: true });
  } catch (e) {
    return mapApiError(e);
  }
}
