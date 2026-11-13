import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

/** Avisos de WhatsApp aos passageiros desta empresa (ligado por padrão). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "financeiro", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const { id } = await params;
    const { data } = await db.from("clients").select("notify_passengers").eq("id", id).eq("tenant_id", assertTenantScope(session)).maybeSingle();
    return ok({ enabled: data?.notify_passengers !== false });
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
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await request.json());
    const { error } = await db.from("clients").update({ notify_passengers: enabled }).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "client.notify_passengers", entityType: "client", entityId: id, metadata: { enabled }, request });
    return ok({ enabled });
  } catch (e) {
    return mapApiError(e);
  }
}
