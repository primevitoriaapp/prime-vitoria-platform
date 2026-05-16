import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { canListAuditEvents } from "@/lib/security/audit-list-access";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  entity_type: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(120).optional()
});

/** Lista eventos de auditoria do tenant (admin, operador ou financeiro). */
export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!canListAuditEvents(session.role)) {
      return fail("FORBIDDEN", "Auditoria reservada a admin, operador e financeiro", 403);
    }
    const tenantId = assertTenantScope(session);
    const filters = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;

    let query = db
      .from("audit_events")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (filters.entity_type) {
      query = query.eq("entity_type", filters.entity_type);
    }
    if (filters.action) {
      query = query.eq("action", filters.action);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) return fail("AUDIT_LIST_FAILED", error.message, 500);

    return ok({
      items: data ?? [],
      page: filters.page,
      pageSize: filters.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    return mapApiError(error);
  }
}
