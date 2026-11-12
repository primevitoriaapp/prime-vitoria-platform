import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { can } from "@/lib/security/rbac";

const r2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const DEAD = ["cancelled", "rejected", "no_show"];

/**
 * Dinheiro que vem pela frente: o que vamos receber (faturas, a fechar, corridas agendadas)
 * e o que vamos pagar (motoristas e contas), com o saldo previsto de 30 dias.
 */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && !can(session, "finance.read")) return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const now = new Date();
    const today = ymd(now);
    const in7 = ymd(new Date(now.getTime() + 7 * 86400000));
    const in30 = ymd(new Date(now.getTime() + 30 * 86400000));
    const since = new Date(now.getTime() - 120 * 86400000).toISOString();

    const [inv, unb, sched, dp, cp] = await Promise.all([
      db.from("client_invoices").select("id, number, client_id, status, total_amount, due_date").eq("tenant_id", tenantId).in("status", ["aberta", "enviada"]),
      db
        .from("trips")
        .select("client_id, client_amount, reviewed_at, operational_status")
        .eq("tenant_id", tenantId)
        .is("client_invoice_id", null)
        .eq("operational_status", "completed")
        .gte("scheduled_at", since)
        .limit(5000),
      db
        .from("trips")
        .select("client_amount, operational_status, scheduled_at")
        .eq("tenant_id", tenantId)
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", new Date(now.getTime() + 7 * 86400000).toISOString())
        .limit(2000),
      db.from("driver_payables").select("amount, due_date").eq("tenant_id", tenantId).eq("status", "open"),
      db.from("company_payables").select("amount, paid_amount, due_date").eq("tenant_id", tenantId).eq("status", "aberta")
    ]);

    const invoices = inv.data ?? [];
    const cIds = [...new Set(invoices.map((i) => i.client_id as string))];
    const { data: cs } = cIds.length ? await db.from("clients").select("id, name, trade_name").in("id", cIds) : { data: [] as Record<string, unknown>[] };
    const cName = new Map((cs ?? []).map((c) => [c.id as string, String(c.trade_name || c.name || "Cliente")]));

    const sent = invoices.filter((i) => i.status === "enviada");
    const overdue = sent.filter((i) => String(i.due_date) < today);
    const sum = (rows: Record<string, unknown>[], k = "total_amount") => r2(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0));
    const toClose = (unb.data ?? []).filter((t) => t.reviewed_at);
    const toApprove = (unb.data ?? []).filter((t) => !t.reviewed_at);
    const upcoming = (sched.data ?? []).filter((t) => !DEAD.includes(t.operational_status as string) && t.operational_status !== "completed");
    const drivers = dp.data ?? [];
    const bills = (cp.data ?? []).map((b) => ({ amount: Number(b.amount ?? 0) - Number(b.paid_amount ?? 0), due_date: b.due_date as string | null }));

    const receive30 = sum(invoices.filter((i) => String(i.due_date) <= in30));
    const payDrivers30 = r2(drivers.filter((d) => !d.due_date || String(d.due_date) <= in30).reduce((s, d) => s + Number(d.amount ?? 0), 0));
    const payBills30 = r2(bills.filter((b) => !b.due_date || b.due_date <= in30).reduce((s, b) => s + b.amount, 0));

    return ok({
      receber: {
        enviadas_total: sum(sent),
        enviadas_count: sent.length,
        vencidas_total: sum(overdue),
        vencidas_count: overdue.length,
        a_enviar_total: sum(invoices.filter((i) => i.status === "aberta")),
        a_enviar_count: invoices.filter((i) => i.status === "aberta").length,
        a_fechar_total: sum(toClose, "client_amount"),
        a_fechar_count: toClose.length,
        a_aprovar_total: sum(toApprove, "client_amount"),
        a_aprovar_count: toApprove.length,
        agendadas_7d_total: sum(upcoming, "client_amount"),
        agendadas_7d_count: upcoming.length,
        proximas: [...invoices]
          .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
          .slice(0, 6)
          .map((i) => ({ id: i.id, number: i.number, client: cName.get(i.client_id as string) ?? "Cliente", due_date: i.due_date, total: Number(i.total_amount), status: i.status, late: i.status === "enviada" && String(i.due_date) < today }))
      },
      pagar: {
        motoristas_total: r2(drivers.reduce((s, d) => s + Number(d.amount ?? 0), 0)),
        motoristas_7d: r2(drivers.filter((d) => !d.due_date || String(d.due_date) <= in7).reduce((s, d) => s + Number(d.amount ?? 0), 0)),
        contas_total: r2(bills.reduce((s, b) => s + b.amount, 0)),
        contas_7d: r2(bills.filter((b) => !b.due_date || b.due_date <= in7).reduce((s, b) => s + b.amount, 0))
      },
      saldo_30d: { receber: receive30, pagar: r2(payDrivers30 + payBills30), saldo: r2(receive30 - payDrivers30 - payBills30) }
    });
  } catch (e) {
    return mapApiError(e);
  }
}
