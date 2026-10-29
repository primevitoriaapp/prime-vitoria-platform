import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { approveQuote } from "@/lib/quotes/approve-quote";

/** A central marca que o cliente aprovou: corridas entram na agenda. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const r = await approveQuote(tenantId, id, session.userId);
    if (!r.ok) return fail(r.code, r.message, r.status);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "quote.approve",
      entityType: "quote",
      entityId: id,
      metadata: { trips: r.trips, client_id: r.client_id },
      request
    });
    return ok({ trips: r.trips, client_id: r.client_id });
  } catch (error) {
    return mapApiError(error);
  }
}
