import { fail, mapApiError, ok } from "@/lib/server/http";
import { processErpWebhookInbox } from "@/lib/jobs/processors";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability, can } from "@/lib/security/rbac";
import { runIntegrationGuards } from "@/lib/security/integration-guard";

function mapIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
  if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
  if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
  return mapApiError(error);
}

/** Processa webhooks pendentes do tenant (financeiro ou operador com erp.jobs.process). */
export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "webhook-inbox-process-post");
    const session = await getSessionContext();
    if (!can(session, "finance.write") && !can(session, "erp.jobs.process")) {
      assertCapability(session, "finance.write");
    }
    const tenantId = assertTenantScope(session);

    const result = await processErpWebhookInbox({ tenantId, limit: 50 });
    return ok(result);
  } catch (error) {
    return mapIntegrationError(error);
  }
}
