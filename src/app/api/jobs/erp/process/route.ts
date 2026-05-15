import { fail, ok } from "@/lib/server/http";
import { processErpSyncJobs, processErpWebhookInbox } from "@/lib/jobs/processors";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";
import { isErpJobProcessMachineRequest } from "@/lib/security/erp-job-process-auth";

export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "erp-process-post");

    if (!isErpJobProcessMachineRequest(request)) {
      const session = await getSessionContext();
      assertCapability(session, "erp.jobs.process");
    }

    const [sync, webhooks] = await Promise.all([processErpSyncJobs(), processErpWebhookInbox()]);
    return ok({ sync, webhooks });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("ERP_PROCESS_FAILED", message, 500);
  }
}
