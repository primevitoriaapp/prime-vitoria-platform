import { fail, ok } from "@/lib/server/http";
import { runReconciliation } from "@/lib/jobs/processors";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";
import { isMachineBearerAuthorized } from "@/lib/security/machine-bearer-auth";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "reconcile-run-post");

    let tenantId: string | undefined;

    if (!isMachineBearerAuthorized(request, process.env.RECONCILE_JOB_PROCESS_SECRET)) {
      const session = await getSessionContext();
      assertCapability(session, "jobs.reconcile.run");
      tenantId = assertTenantScope(session);
    } else {
      const raw = new URL(request.url).searchParams.get("tenant_id");
      if (raw && uuidRe.test(raw)) {
        tenantId = raw;
      }
    }

    const result = await runReconciliation({ tenantId, limit: 500 });
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("RECONCILE_RUN_FAILED", message, 500);
  }
}
