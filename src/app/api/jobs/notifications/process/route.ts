import { z } from "zod";
import { fail, ok } from "@/lib/server/http";
import { processNotificationJobs } from "@/lib/jobs/processors";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";
import { isMachineBearerAuthorized } from "@/lib/security/machine-bearer-auth";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const processQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tenant_id: z.string().uuid().optional()
});

export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "notifications-process-post");

    const q = processQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    let tenantId: string | undefined;

    if (!isMachineBearerAuthorized(request, process.env.NOTIFICATION_JOB_PROCESS_SECRET)) {
      const session = await getSessionContext();
      assertCapability(session, "jobs.notifications.process");
      tenantId = assertTenantScope(session);
    } else if (q.tenant_id && uuidRe.test(q.tenant_id)) {
      tenantId = q.tenant_id;
    }

    const result = await processNotificationJobs({ limit: q.limit, tenantId });
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("NOTIFICATION_PROCESS_FAILED", message, 500);
  }
}
