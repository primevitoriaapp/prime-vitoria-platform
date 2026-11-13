import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { pushToStaff } from "@/lib/push/web-push";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";

/** Corrida sem telefone do passageiro: o motorista pede o contato e a central é avisada. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    assertCapability(session, "trip.status");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: trip } = await db.from("trips").select("id, driver_id, scheduled_at, origin_text").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    if (!session.driverId || trip.driver_id !== session.driverId) return fail("FORBIDDEN", "Esta corrida não está com você", 403);
    const { data: drv } = await db.from("drivers").select("full_name").eq("id", session.driverId).maybeSingle();
    const name = String(drv?.full_name ?? "Motorista").split(" ")[0];
    const when = new Date(String(trip.scheduled_at)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const sent = await pushToStaff(tenantId, {
      title: `📞 ${name} pede o telefone do passageiro`,
      body: `Corrida de ${when} · ${String(trip.origin_text ?? "").split(",")[0]}. Coloque nome e telefone do passageiro na corrida.`,
      url: `${OFFICIAL_URLS.central}/agenda`,
      tag: `contact-${id}`
    }).catch(() => 0);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "trip.contact_request", entityType: "trip", entityId: id, metadata: { driver_id: session.driverId }, request });
    return ok({ notified: sent });
  } catch (e) {
    return mapApiError(e);
  }
}
