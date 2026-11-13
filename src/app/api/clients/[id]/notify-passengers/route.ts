import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

/** Opções do serviço da empresa: avisos de WhatsApp aos passageiros e assinatura no fim da corrida. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "financeiro", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const { id } = await params;
    const { data } = await db.from("clients").select("notify_passengers, requires_signature").eq("id", id).eq("tenant_id", assertTenantScope(session)).maybeSingle();
    return ok({ enabled: data?.notify_passengers !== false, requires_signature: data?.requires_signature === true });
  } catch (e) {
    return mapApiError(e);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = z.object({ enabled: z.boolean().optional(), requires_signature: z.boolean().optional() }).parse(await request.json());
    const patch: Record<string, boolean> = {};
    if (body.enabled !== undefined) patch.notify_passengers = body.enabled;
    if (body.requires_signature !== undefined) patch.requires_signature = body.requires_signature;
    if (!Object.keys(patch).length) return fail("NOTHING", "Nada para salvar", 400);
    const { error } = await db.from("clients").update(patch).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "client.notify_passengers", entityType: "client", entityId: id, metadata: patch, request });
    return ok(patch);
  } catch (e) {
    return mapApiError(e);
  }
}
