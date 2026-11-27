import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

const schema = z.object({ reason: z.string().trim().min(3, "Escreva o motivo").max(600) });

/** Recusa o candidato e guarda o motivo (a mensagem ao motorista sai pelo WhatsApp da central). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const b = schema.parse(await request.json().catch(() => ({})));
    const { data, error } = await db
      .from("site_leads")
      .update({ status: "descartado", decision_reason: b.reason, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("driver_id", null)
      .select("id")
      .maybeSingle();
    if (error) return fail("REFUSE_FAILED", error.message, 500);
    if (!data) return fail("NOT_FOUND", "Cadastro não encontrado (ou já ativado).", 404);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "lead.refuse", entityType: "site_lead", entityId: id, metadata: { reason: b.reason }, request });
    return ok({ refused: true });
  } catch (e) {
    return mapApiError(e);
  }
}
