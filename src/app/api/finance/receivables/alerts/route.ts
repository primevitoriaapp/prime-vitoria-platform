import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { classifyReceivables, todayInSaoPaulo, type ReceivableAlertRow } from "@/lib/finance/receivable-alerts";

/** Contas a receber vencidas e que vencem em até 3 dias (alerta do painel). */
export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.read");
    const tenantId = assertTenantScope(session);

    const { data, error } = await db
      .from("accounts_receivable")
      .select("id, amount, due_date, client_id")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .order("due_date", { ascending: true })
      .limit(500);
    if (error) return fail("RECEIVABLE_ALERTS_FAILED", error.message, 500);

    const clientIds = [...new Set((data ?? []).map((r) => r.client_id as string).filter(Boolean))];
    const names = new Map<string, string>();
    if (clientIds.length) {
      const { data: clients } = await db.from("clients").select("id, name, trade_name").in("id", clientIds);
      for (const c of clients ?? []) names.set(c.id as string, ((c.trade_name as string) || (c.name as string)) ?? "");
    }

    const rows: ReceivableAlertRow[] = (data ?? []).map((r) => ({
      id: r.id as string,
      client_name: names.get(r.client_id as string) ?? null,
      amount: Number(r.amount),
      due_date: String(r.due_date)
    }));
    return ok(classifyReceivables(rows, todayInSaoPaulo()));
  } catch (error) {
    return mapApiError(error);
  }
}
