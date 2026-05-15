import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { summarizeClosingsToDre } from "@/lib/finance/dre-summary";
import { dreSummaryReportHtml } from "@/lib/finance/dre-report-html";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

const querySchema = z.object({
  format: z.enum(["json", "html"]).default("json"),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function sumAmounts(rows: { amount: number }[] | null): number {
  return (rows ?? []).reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
}

/** Resumo DRE do tenant no período (a partir de `financial_closings` + posição AR/AP). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.read");
    const tenantId = assertTenantScope(session);

    const q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (q.period_end < q.period_start) {
      return fail("INVALID_PERIOD", "period_end deve ser >= period_start", 400);
    }

    const { data: closings, error: closErr } = await db
      .from("financial_closings")
      .select("entity_type, gross_amount, cost_amount, margin_amount, status")
      .eq("tenant_id", tenantId)
      .eq("period_start", q.period_start)
      .eq("period_end", q.period_end);

    if (closErr) return fail("DRE_CLOSINGS_FAILED", closErr.message, 500);

    const dre = summarizeClosingsToDre(q.period_start, q.period_end, closings ?? []);

    const endIso = `${q.period_end}T23:59:59.999Z`;

    const [
      { data: arOpenRows },
      { data: arPaidRows },
      { data: apOpenRows },
      { data: apPaidRows }
    ] = await Promise.all([
      db
        .from("accounts_receivable")
        .select("amount")
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .lte("due_date", q.period_end),
      db
        .from("accounts_receivable")
        .select("amount")
        .eq("tenant_id", tenantId)
        .eq("status", "paid")
        .gte("paid_at", q.period_start)
        .lte("paid_at", endIso),
      db
        .from("driver_payables")
        .select("amount")
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .lte("due_date", q.period_end),
      db
        .from("driver_payables")
        .select("amount")
        .eq("tenant_id", tenantId)
        .eq("status", "paid")
        .gte("paid_at", q.period_start)
        .lte("paid_at", endIso)
    ]);

    const receivables = {
      open_count: arOpenRows?.length ?? 0,
      open_amount: sumAmounts(arOpenRows),
      paid_in_period_count: arPaidRows?.length ?? 0,
      paid_in_period_amount: sumAmounts(arPaidRows)
    };
    const payables = {
      open_count: apOpenRows?.length ?? 0,
      open_amount: sumAmounts(apOpenRows),
      paid_in_period_count: apPaidRows?.length ?? 0,
      paid_in_period_amount: sumAmounts(apPaidRows)
    };

    if (q.format === "html") {
      const html = dreSummaryReportHtml(
        dre,
        {
          receivables: {
            open_count: receivables.open_count,
            open_amount: receivables.open_amount,
            paid_in_period_amount: receivables.paid_in_period_amount
          },
          payables: {
            open_count: payables.open_count,
            open_amount: payables.open_amount,
            paid_in_period_amount: payables.paid_in_period_amount
          }
        },
        new Date()
      );
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="dre-${q.period_start}-${q.period_end}.html"`
        }
      });
    }

    return ok({
      dre,
      receivables,
      payables,
      hint:
        dre.closing_rows === 0
          ? "Gere rascunhos em POST /api/finance/closings/generate para popular o DRE deste período."
          : null
    });
  } catch (error) {
    return mapApiError(error);
  }
}
