import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

const DEAD = new Set(["cancelled", "rejected", "no_show"]);

/** Resumo do mês por cliente (?month=2026-11): corridas, valores, o que falta faturar e faturas pendentes. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!["admin", "financeiro", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) return fail("VALIDATION_ERROR", "Mês inválido", 400);
    const [y, m] = month.split("-").map(Number);
    const from = new Date(`${month}-01T00:00:00-03:00`).toISOString();
    const to = new Date(`${new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)}T23:59:59-03:00`).toISOString();
    const { data: trips, error } = await db
      .from("trips")
      .select("client_id, operational_status, reviewed_at, client_amount, client_invoice_id")
      .eq("tenant_id", tenantId)
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .limit(5000);
    if (error) return fail("LIST_FAILED", error.message, 500);
    const by = new Map<string, { client_id: string; trips: number; done: number; total: number; to_approve: number; unbilled: number; billed: number }>();
    for (const t of trips ?? []) {
      if (DEAD.has(t.operational_status as string)) continue;
      const id = t.client_id as string;
      const g = by.get(id) ?? { client_id: id, trips: 0, done: 0, total: 0, to_approve: 0, unbilled: 0, billed: 0 };
      const amt = Number(t.client_amount ?? 0);
      g.trips += 1;
      if (t.operational_status === "completed") {
        g.done += 1;
        g.total += amt;
        if (!t.reviewed_at) g.to_approve += 1;
        if (t.client_invoice_id) g.billed += amt;
        else g.unbilled += amt;
      }
      by.set(id, g);
    }
    const ids = [...by.keys()];
    const [{ data: cs }, { data: invs }] = await Promise.all([
      ids.length ? db.from("clients").select("id, name, trade_name, type").in("id", ids) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      db.from("client_invoices").select("client_id, status, total_amount, nf_path, sent_at").eq("tenant_id", tenantId).in("status", ["aberta", "enviada"])
    ]);
    const names = new Map((cs ?? []).map((c) => [c.id as string, { name: String(c.trade_name || c.name || "Cliente"), type: (c.type as string) ?? "PJ" }]));
    const pend = new Map<string, { a_enviar: number; a_receber: number; a_receber_total: number }>();
    for (const i of invs ?? []) {
      const id = i.client_id as string;
      const p = pend.get(id) ?? { a_enviar: 0, a_receber: 0, a_receber_total: 0 };
      if (i.status === "aberta") p.a_enviar += 1;
      else {
        p.a_receber += 1;
        p.a_receber_total += Number(i.total_amount ?? 0);
      }
      pend.set(id, p);
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const rows = ids
      .map((id) => {
        const g = by.get(id)!;
        const p = pend.get(id) ?? { a_enviar: 0, a_receber: 0, a_receber_total: 0 };
        return { ...g, total: r2(g.total), unbilled: r2(g.unbilled), billed: r2(g.billed), ...p, a_receber_total: r2(p.a_receber_total), name: names.get(id)?.name ?? "Cliente", type: names.get(id)?.type ?? "PJ" };
      })
      .sort((a, b) => b.total - a.total);
    return ok({ month, clients: rows });
  } catch (e) {
    return mapApiError(e);
  }
}
