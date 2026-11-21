import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { formatQuoteNumber } from "@/lib/quotes/quote-calc";
import { quoteShareLink } from "@/lib/quotes/quote-share";

/** Link público do orçamento (para mandar pelo WhatsApp ou copiar). Não envia nada sozinho. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: q } = await db.from("quotes").select("id, number, share_token, total").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    const link = await quoteShareLink(id, q.share_token as string | null);
    return ok({ link, number: formatQuoteNumber(q.number as number), total: Number(q.total ?? 0) });
  } catch (e) {
    return mapApiError(e);
  }
}
