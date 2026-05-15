import { fail, ok } from "@/lib/server/http";
import { processNotificationJobs } from "@/lib/jobs/processors";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";
import { isMachineBearerAuthorized } from "@/lib/security/machine-bearer-auth";

export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "notifications-process-post");

    if (!isMachineBearerAuthorized(request, process.env.NOTIFICATION_JOB_PROCESS_SECRET)) {
      const session = await getSessionContext();
      assertCapability(session, "jobs.notifications.process");
    }

    const result = await processNotificationJobs();
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("NOTIFICATION_PROCESS_FAILED", message, 500);
  }
}
