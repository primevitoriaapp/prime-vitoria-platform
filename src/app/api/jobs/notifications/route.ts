import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";

const listSchema = z.object({
  status: z.enum(["queued", "success", "error"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

/** Lista fila de notificacoes da organizacao (monitoramento operacional). */
export async function GET(request: Request) {
  try {
    runIntegrationGuards(request, "notifications-list-get");
    const session = await getSessionContext();
    assertCapability(session, "jobs.notifications.process");
    const tenantId = assertTenantScope(session);

    const q = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const from = (q.page - 1) * q.pageSize;
    const to = from + q.pageSize - 1;

    let query = db
      .from("notification_jobs")
      .select(
        "id, type, status, attempt_count, max_attempts, last_error, correlation_id, payload, created_at, updated_at",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q.status) {
      query = query.eq("status", q.status);
    }

    const { data, error, count } = await query;
    if (error) return fail("NOTIFICATION_JOBS_LIST_FAILED", error.message, 500);

    return ok({
      items: data ?? [],
      page: q.page,
      pageSize: q.pageSize,
      total: count ?? 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("INVALID_REQUEST", message, 400);
  }
}
