import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { payableSituation } from "@/lib/finance/company-payables-calc";

/** Contas da empresa vencidas ou vencendo em até 5 dias (alerta do topo). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const { data, error } = await db
      .from("company_payables")
      .select("id, description, supplier, amount, due_date, status")
      .eq("tenant_id", tenantId)
      .eq("status", "aberta")
      .order("due_date", { ascending: true })
      .limit(300);
    if (error) return fail("ALERTS_FAILED", error.message, 500);
    const items = (data ?? [])
      .map((r) => ({ ...r, amount: Number(r.amount), situation: payableSituation(r as { status: string; due_date: string }, today) }))
      .filter((r) => r.situation === "vencida" || r.situation === "vence_hoje" || r.situation === "vence_breve");
    const overdue = items.filter((r) => r.situation === "vencida");
    const soon = items.filter((r) => r.situation !== "vencida");
    const sum = (xs: typeof items) => Math.round(xs.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    return ok({
      overdue: { count: overdue.length, total: sum(overdue), items: overdue.slice(0, 10) },
      due_soon: { count: soon.length, total: sum(soon), items: soon.slice(0, 10) }
    });
  } catch (error) {
    return mapApiError(error);
  }
}
