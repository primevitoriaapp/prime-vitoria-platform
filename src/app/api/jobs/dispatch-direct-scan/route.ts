import { fail, ok } from "@/lib/server/http";
import { scanAndAssignStaleApprovedTrips } from "@/lib/dispatch/auto-direct-assign-scan";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { runIntegrationGuards } from "@/lib/security/integration-guard";
import { isDispatchDirectScanMachineRequest } from "@/lib/security/dispatch-direct-scan-auth";

const DEFAULT_MAX = 25;

export async function POST(request: Request) {
  try {
    runIntegrationGuards(request, "dispatch-direct-scan-post");

    const machine = isDispatchDirectScanMachineRequest(request);
    let tenantFilter: string | null = null;
    if (!machine) {
      const session = await getSessionContext();
      assertCapability(session, "dispatch");
      tenantFilter = assertTenantScope(session);
    }

    const body = (await request.json().catch(() => ({}))) as { max_trips_per_tenant?: number; tenant_id?: string };
    const maxTripsPerTenant = Math.min(
      100,
      Math.max(1, Number(body.max_trips_per_tenant) || DEFAULT_MAX)
    );

    const tenantId = machine
      ? typeof body.tenant_id === "string" && body.tenant_id.trim()
        ? body.tenant_id.trim()
        : null
      : tenantFilter;

    const result = await scanAndAssignStaleApprovedTrips({
      tenantId,
      maxTripsPerTenant,
      request
    });

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Integration access denied")) return fail("FORBIDDEN_IP", message, 403);
    if (message.includes("Rate limit exceeded")) return fail("RATE_LIMIT", message, 429);
    if (message.startsWith("Forbidden:")) return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    return fail("DISPATCH_DIRECT_SCAN_FAILED", message, 500);
  }
}
