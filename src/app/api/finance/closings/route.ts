import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { summarizeClosingsToDre } from "@/lib/finance/dre-summary";
import { rowsToCsv } from "@/lib/reports/csv";
import { parseFinanceClosingsListQuery } from "@/lib/finance/closings-query";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.read");
    const tenantId = assertTenantScope(session);

    const q = parseFinanceClosingsListQuery(new URL(request.url).searchParams);
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("financial_closings")
      .select(
        "id, period_start, period_end, entity_type, entity_id, gross_amount, cost_amount, margin_amount, status, closed_at, created_at",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("period_start", { ascending: false })
      .range(from, to);

    if (q.period_start) query = query.eq("period_start", q.period_start);
    if (q.period_end) query = query.eq("period_end", q.period_end);
    if (q.status) query = query.eq("status", q.status);

    const { data, error, count } = await query;
    if (error) return fail("CLOSINGS_LIST_FAILED", error.message, 500);

    const items = data ?? [];

    if (q.format === "csv") {
      const csv = rowsToCsv(
        [
          "id",
          "period_start",
          "period_end",
          "entity_type",
          "entity_id",
          "gross_amount",
          "cost_amount",
          "margin_amount",
          "status",
          "closed_at"
        ],
        items.map((r) => [
          r.id,
          r.period_start,
          r.period_end,
          r.entity_type,
          r.entity_id,
          r.gross_amount,
          r.cost_amount,
          r.margin_amount,
          r.status,
          r.closed_at ?? ""
        ])
      );
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="fechamentos-${q.period_start ?? "all"}-${q.period_end ?? "all"}.csv"`
        }
      });
    }

    const dre =
      q.period_start && q.period_end
        ? summarizeClosingsToDre(q.period_start, q.period_end, items)
        : null;

    return ok({ items, dre, page: q.page, pageSize: q.pageSize, total: count ?? 0 });
  } catch (error) {
    return mapApiError(error);
  }
}
