import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { quoteSchema } from "@/lib/quotes/quote-schema";
import { quoteTotals } from "@/lib/quotes/quote-calc";

const staff = (r: string) => r === "admin" || r === "operador" || r === "financeiro";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: q } = await db.from("quotes").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    const [{ data: items }, client, { data: trips }] = await Promise.all([
      db.from("quote_items").select("*").eq("quote_id", id).order("position"),
      q.client_id ? db.from("clients").select("id, name, trade_name, document, email, phone, whatsapp, type").eq("id", q.client_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from("trips").select("id, scheduled_at, operational_status, driver_id").eq("quote_id", id).order("scheduled_at")
    ]);
    return ok({ ...q, items: items ?? [], client: client.data, trips: trips ?? [] });
  } catch (error) {
    return mapApiError(error);
  }
}

/** Edita cabeçalho e itens (enquanto não foi aprovado). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: q } = await db.from("quotes").select("id, status").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    if (q.status === "aprovado") return fail("LOCKED", "Orçamento aprovado não pode ser editado; as corridas já estão na agenda.", 409);
    const { items, ...head } = quoteSchema.parse(await request.json());
    const totals = quoteTotals(items, head.discount);
    const { error } = await db
      .from("quotes")
      .update({ ...head, discount: totals.discount, total: totals.total, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    await db.from("quote_items").delete().eq("quote_id", id);
    const { error: iErr } = await db.from("quote_items").insert(items.map((it, i) => ({ ...it, quote_id: id, position: i })));
    if (iErr) return fail("ITEMS_FAILED", iErr.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "quote.update", entityType: "quote", entityId: id, metadata: { total: totals.total }, request });
    return ok({ id, total: totals.total });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só o administrador exclui orçamentos", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: q } = await db.from("quotes").select("status").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    if (q.status === "aprovado") return fail("LOCKED", "Orçamento aprovado não pode ser excluído; cancele as corridas na agenda.", 409);
    await db.from("quotes").delete().eq("id", id);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "quote.delete", entityType: "quote", entityId: id, request });
    return ok({ deleted: true });
  } catch (error) {
    return mapApiError(error);
  }
}
