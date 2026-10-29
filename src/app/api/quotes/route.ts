import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { quoteSchema } from "@/lib/quotes/quote-schema";
import { quoteTotals } from "@/lib/quotes/quote-calc";

const staff = (r: string) => r === "admin" || r === "operador" || r === "financeiro";

export async function GET() {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { data, error } = await db.from("quotes").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500);
    if (error) return fail("LIST_FAILED", error.message, 500);
    const ids = [...new Set((data ?? []).map((q) => q.client_id as string).filter(Boolean))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: cl } = await db.from("clients").select("id, name, trade_name").in("id", ids);
      for (const c of cl ?? []) names.set(c.id as string, ((c.trade_name as string) || (c.name as string)) ?? "");
    }
    return ok((data ?? []).map((q) => ({ ...q, client_name: q.client_id ? (names.get(q.client_id as string) ?? null) : null })));
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const { items, ...head } = quoteSchema.parse(await request.json());
    if (!head.client_id && !(head.contact_name && head.contact_name.length >= 2)) return fail("NO_CLIENT", "Escolha o cliente ou informe o nome do contato.", 400);
    const totals = quoteTotals(items, head.discount);
    const { data: q, error } = await db
      .from("quotes")
      .insert({ ...head, discount: totals.discount, total: totals.total, tenant_id: tenantId, created_by: session.userId })
      .select("*")
      .single();
    if (error) return fail("CREATE_FAILED", error.message, 500);
    const { error: iErr } = await db.from("quote_items").insert(items.map((it, i) => ({ ...it, quote_id: q.id, position: i })));
    if (iErr) {
      await db.from("quotes").delete().eq("id", q.id);
      return fail("ITEMS_FAILED", iErr.message, 500);
    }
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "quote.create", entityType: "quote", entityId: q.id as string, metadata: { total: totals.total }, request });
    return ok(q, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
