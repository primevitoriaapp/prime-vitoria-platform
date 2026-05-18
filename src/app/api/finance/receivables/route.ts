import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { parseReceivablesListQuery } from "@/lib/finance/receivables-query";

/** Lista titulos a receber do tenant (via viagem). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "finance.read");
    const tenantId = assertTenantScope(session);

    const q = parseReceivablesListQuery(new URL(request.url).searchParams);
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("accounts_receivable")
      .select("id, trip_id, client_id, amount, due_date, status, issue_date, created_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("due_date", { ascending: true })
      .range(from, to);

    if (q.status) {
      query = query.eq("status", q.status);
    }
    if (q.due_from) {
      query = query.gte("due_date", q.due_from);
    }
    if (q.due_to) {
      query = query.lte("due_date", q.due_to);
    }

    const { data, error, count } = await query;
    if (error) return fail("RECEIVABLES_LIST_FAILED", error.message, 500);

    return ok({
      items: data ?? [],
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    return mapApiError(error);
  }
}
