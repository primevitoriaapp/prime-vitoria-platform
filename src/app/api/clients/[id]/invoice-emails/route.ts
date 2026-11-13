import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

/** E-mails que recebem as faturas do cliente (vários). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "financeiro", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const { id } = await params;
    const { data } = await db.from("clients").select("invoice_emails").eq("id", id).eq("tenant_id", assertTenantScope(session)).maybeSingle();
    return ok({ emails: (data?.invoice_emails as string[] | null) ?? [] });
  } catch (e) {
    return mapApiError(e);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Só admin ou financeiro", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { emails } = z.object({ emails: z.array(z.string()).max(15) }).parse(await request.json());
    const clean = [...new Set(emails.map((e) => e.replace(/\s+/g, "").toLowerCase()).filter(Boolean))];
    const bad = clean.filter((e) => !/^[^@]+@[^@]+\.[^@]+$/.test(e));
    if (bad.length) return fail("EMAIL_INVALID", `E-mail inválido: ${bad.join(", ")}`, 400);
    const { error } = await db.from("clients").update({ invoice_emails: clean }).eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "client.invoice_emails", entityType: "client", entityId: id, metadata: { emails: clean }, request });
    return ok({ emails: clean });
  } catch (e) {
    return mapApiError(e);
  }
}
