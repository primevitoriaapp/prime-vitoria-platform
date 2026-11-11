import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { LINK_COLS, markLinkPaid } from "@/lib/finance/payment-links";

/**
 * - "pago_manual": o cliente pagou mas o aviso não chegou (confira no app da InfinitePay antes).
 * - "cancelar": tira o link da lista (na InfinitePay ele continua existindo; não reenvie ao cliente).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Só admin ou financeiro", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { action } = z.object({ action: z.enum(["pago_manual", "cancelar"]) }).parse(await request.json());
    const { data: l } = await db.from("payment_links").select(LINK_COLS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!l) return fail("NOT_FOUND", "Link não encontrado", 404);
    if (action === "cancelar") {
      if (l.status === "pago") return fail("ALREADY_PAID", "Este link já foi pago.", 409);
      await db.from("payment_links").update({ status: "cancelado" }).eq("id", id);
    } else {
      if (l.status === "cancelado") return fail("CANCELLED", "Link cancelado.", 409);
      await markLinkPaid(id, { paid_amount: null, installments: null, capture_method: null, transaction_nsu: null, receipt_url: null, slug: null, raw: { manual: true, by: session.userId } });
    }
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: `payment_link.${action}`, entityType: "payment_link", entityId: id, metadata: { amount: l.amount }, request });
    const { data: row } = await db.from("payment_links").select(LINK_COLS).eq("id", id).maybeSingle();
    return ok(row);
  } catch (e) {
    return mapApiError(e);
  }
}
