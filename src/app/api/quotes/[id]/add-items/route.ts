import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { quoteItemSchema } from "@/lib/quotes/quote-schema";
import { itemsMissingForTrips, quoteTotals } from "@/lib/quotes/quote-calc";
import { quoteTripRows } from "@/lib/quotes/approve-quote";

const schema = z.object({ items: z.array(quoteItemSchema).min(1).max(20) });

/**
 * Orçamento já aprovado: inclui serviços novos (ex.: transfer a mais no evento).
 * Os itens entram no orçamento (em ordem de data e hora) e viram corridas na Agenda.
 * Os itens antigos e as corridas que já existem não mudam.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { items } = schema.parse(await request.json());
    const { data: q } = await db.from("quotes").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    if (q.status !== "aprovado" || !q.client_id) return fail("NOT_APPROVED", "Use o botão Salvar normal: este orçamento ainda não foi aprovado.", 409);
    const missing = itemsMissingForTrips(items as never);
    if (missing.length) {
      return fail("INCOMPLETE_ITEMS", `Complete o serviço novo — ${missing.map((m) => `falta ${m.missing.join(", ")}`).join("; ")}.`, 400);
    }

    const { data: old } = await db.from("quote_items").select("*").eq("quote_id", id);
    const { error: iErr } = await db.from("quote_items").insert(items.map((it, i) => ({ ...it, quote_id: id, position: 1000 + i })));
    if (iErr) return fail("ITEMS_FAILED", iErr.message, 500);

    // Corridas só dos itens novos, com o valor cheio digitado (o desconto antigo não se espalha neles).
    const amounts = items.flatMap((it) => Array.from({ length: Number(it.quantity) || 1 }, () => Number(it.unit_price) || 0));
    const rows = await quoteTripRows({ tenantId, quote: q as Record<string, unknown>, items: items as unknown as Record<string, unknown>[], clientId: q.client_id as string, actorUserId: session.userId, amounts, nowIso: new Date().toISOString() });
    const { data: trips, error: tErr } = await db.from("trips").insert(rows).select("id");
    if (tErr) {
      await db.from("quote_items").delete().eq("quote_id", id).gte("position", 1000);
      return fail("TRIPS_FAILED", tErr.message, 500);
    }

    // Reordena todos os itens por data e hora (o novo entra no lugar certo) e refaz o total.
    const { data: all } = await db.from("quote_items").select("id, scheduled_at, service_date, quantity, unit_price, driver_amount").eq("quote_id", id);
    const key = (r: Record<string, unknown>) => String(r.scheduled_at ?? r.service_date ?? "9999");
    const sorted = [...(all ?? [])].sort((a, b) => key(a).localeCompare(key(b)));
    await Promise.all(sorted.map((r, i) => db.from("quote_items").update({ position: i }).eq("id", r.id as string)));
    const totals = quoteTotals(
      sorted.map((r) => ({ quantity: Number(r.quantity) || 1, unit_price: Number(r.unit_price) || 0, driver_amount: r.driver_amount == null ? null : Number(r.driver_amount) })),
      Number(q.discount) || 0
    );
    await db.from("quotes").update({ total: totals.total, updated_at: new Date().toISOString() }).eq("id", id);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "quote.items_added_after_approval",
      entityType: "quote",
      entityId: id,
      metadata: { itens_novos: items.length, corridas_criadas: trips?.length ?? 0, total_antes: Number(q.total), total_depois: totals.total, itens_antes: (old ?? []).length },
      request
    });
    return ok({ trips: trips?.length ?? 0, total: totals.total });
  } catch (e) {
    if (e instanceof z.ZodError) return fail("INVALID_BODY", e.issues[0]?.message ?? "Dados inválidos", 400);
    return mapApiError(e);
  }
}
