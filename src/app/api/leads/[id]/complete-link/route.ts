import { randomBytes } from "node:crypto";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Gera (ou reaproveita) o link do cadastro completo para a central mandar ao motorista. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: lead } = await db.from("site_leads").select("id, kind, complete_token").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!lead || lead.kind !== "motorista") return fail("NOT_FOUND", "Cadastro não encontrado", 404);
    const token = (lead.complete_token as string | null) ?? randomBytes(18).toString("base64url");
    await db
      .from("site_leads")
      .update({ complete_token: token, complete_sent_at: new Date().toISOString(), status: "em_contato", updated_at: new Date().toISOString() })
      .eq("id", id);
    return ok({ url: `https://www.primevitoria.com/cadastro-motorista/${token}` });
  } catch (e) {
    return mapApiError(e);
  }
}
