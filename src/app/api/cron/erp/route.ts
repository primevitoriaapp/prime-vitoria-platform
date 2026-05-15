import { fail, ok } from "@/lib/server/http";
import { processErpSyncJobs, processErpWebhookInbox } from "@/lib/jobs/processors";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

/** Cron Vercel: processa fila ERP sync. */
export async function GET(request: Request) {
  if (!isCronSecretAuthorized(request)) {
    return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  }
  try {
    const [sync, webhooks] = await Promise.all([processErpSyncJobs(20), processErpWebhookInbox({ limit: 30 })]);
    return ok({ cron: "erp", sync, webhooks });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("CRON_ERP_FAILED", message, 500);
  }
}
