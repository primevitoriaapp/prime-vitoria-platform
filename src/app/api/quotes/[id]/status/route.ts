import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

const bodySchema = z.object({ status: z.enum(["rascunho", "enviado", "recusado", "cancelado"]), reason: z.string().trim().max(500).optional() });

/** Marca como enviado, recusado (com motivo), cancelado ou volta a rascunho. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const { data: q } = await db.from("quotes").select("status").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    if (q.status === "aprovado") return fail("LOCKED", "Orçamento já aprovado.", 409);
    const update: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
    if (body.status === "enviado") update.sent_at = new Date().toISOString();
    if (body.status === "recusado") update.refused_reason = body.reason ?? null;
    await db.from("quotes").update(update).eq("id", id);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: `quote.${body.status}`, entityType: "quote", entityId: id, metadata: { reason: body.reason ?? null }, request });
    return ok({ id, status: body.status });
  } catch (error) {
    return mapApiError(error);
  }
}
