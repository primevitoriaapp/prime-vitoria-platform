import { fail, ok } from "@/lib/server/http";
import { scanAndAssignStaleApprovedTrips } from "@/lib/dispatch/auto-direct-assign-scan";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron Vercel: varre corridas approved para despacho directo automático. */
export async function GET(request: Request) {
  if (!isCronSecretAuthorized(request)) {
    return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  }
  try {
    const result = await scanAndAssignStaleApprovedTrips({
      tenantId: null,
      maxTripsPerTenant: 25,
      request: null
    });
    return ok({ cron: "dispatch-scan", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("CRON_DISPATCH_SCAN_FAILED", message, 500);
  }
}
