import { fail, ok } from "@/lib/server/http";
import { runReconciliation } from "@/lib/jobs/processors";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron Vercel: reconciliação ERP diária (todos os tenants). */
export async function GET(request: Request) {
  if (!isCronSecretAuthorized(request)) {
    return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  }
  try {
    const result = await runReconciliation({ limit: 500 });
    return ok({ cron: "reconcile", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("CRON_RECONCILE_FAILED", message, 500);
  }
}
