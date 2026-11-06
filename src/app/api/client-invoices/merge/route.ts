import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

const schema = z.object({
  trip_ids: z.array(z.string().uuid()).min(1).max(50),
  /** Nome do item juntado (ex.: "NR263701-E"); "-" = deixar separado; null = automático. */
  key: z.string().trim().max(80).nullable()
});

/** Juntar (ou separar) serviços na fatura do cliente. Não muda as corridas, só como aparecem na fatura. */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const b = schema.parse(await request.json().catch(() => ({})));
    const { data: trips } = await db.from("trips").select("id, client_id").eq("tenant_id", tenantId).in("id", b.trip_ids);
    if ((trips ?? []).length !== b.trip_ids.length) return fail("NOT_FOUND", "Corrida não encontrada", 404);
    if (new Set((trips ?? []).map((t) => t.client_id)).size > 1) return fail("VALIDATION_ERROR", "Só dá para juntar serviços do mesmo cliente.", 400);
    const { error } = await db.from("trips").update({ invoice_merge_key: b.key || null }).eq("tenant_id", tenantId).in("id", b.trip_ids);
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "invoice.merge_services", entityType: "trip", entityId: b.trip_ids[0], metadata: { corridas: b.trip_ids.length, item: b.key } }).catch(() => undefined);
    return ok({ updated: b.trip_ids.length });
  } catch (e) {
    return mapApiError(e);
  }
}
