import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "report.read");
    const tenantId = assertTenantScope(session);

    const [totalRes, completedRes, driversRes] = await Promise.all([
      db.from("trips").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      db
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("operational_status", "completed"),
      db.from("drivers").select("id", { count: "exact", head: true }).eq("active", true).eq("tenant_id", tenantId)
    ]);

    if (totalRes.error || completedRes.error || driversRes.error) {
      return fail("REPORT_FAILED", "Falha ao gerar relatorio operacional", 500);
    }

    return ok({
      totalTrips: totalRes.count ?? 0,
      completedTrips: completedRes.count ?? 0,
      activeDrivers: driversRes.count ?? 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) {
      return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    }
    return fail("INVALID_REQUEST", message, 400);
  }
}
