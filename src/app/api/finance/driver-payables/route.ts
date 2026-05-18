import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { driverPayableForecast } from "@/lib/finance/driver-payable-forecast";
import { parseDriverPayablesListQuery } from "@/lib/finance/driver-payables-query";

/** Lista contas a pagar (motorista) do tenant via viagem. */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);

    if (session.role === "motorista") {
      assertCapability(session, "finance.payable.read.own");
      if (!session.driverId) {
        return fail("FORBIDDEN", "Motorista precisa de cadastro vinculado", 403);
      }
    } else {
      assertCapability(session, "finance.read");
    }

    const q = parseDriverPayablesListQuery(new URL(request.url).searchParams);
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("driver_payables")
      .select("id, trip_id, driver_id, amount, due_date, status, paid_at", { count: "exact" })
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
    if (session.role === "motorista" && session.driverId) {
      query = query.eq("driver_id", session.driverId);
    }

    const { data, error, count } = await query;
    if (error) return fail("DRIVER_PAYABLES_LIST_FAILED", error.message, 500);

    return ok({
      items: (data ?? []).map((row) => ({
        ...row,
        ...driverPayableForecast({ due_date: row.due_date as string, status: row.status as string })
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    return mapApiError(error);
  }
}
