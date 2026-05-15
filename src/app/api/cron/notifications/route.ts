import { fail, ok } from "@/lib/server/http";
import { processNotificationJobs } from "@/lib/jobs/processors";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

/** Cron Vercel: processa fila de notificações (definir CRON_SECRET + FCM_SERVER_KEY). */
export async function GET(request: Request) {
  if (!isCronSecretAuthorized(request)) {
    return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  }
  try {
    const result = await processNotificationJobs({ limit: 30 });
    return ok({ cron: "notifications", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("CRON_NOTIFICATION_FAILED", message, 500);
  }
}
