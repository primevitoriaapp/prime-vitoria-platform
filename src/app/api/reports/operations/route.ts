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

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    const [totalRes, completedRes, driversRes, revenueRes, receivableRes] = await Promise.all([
      db.from("trips").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      db
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("operational_status", "completed"),
      db.from("drivers").select("id", { count: "exact", head: true }).eq("active", true).eq("tenant_id", tenantId),
      db
        .from("trips")
        .select("client_amount")
        .eq("tenant_id", tenantId)
        .eq("operational_status", "completed")
        .gte("scheduled_at", monthStartIso)
        .not("client_amount", "is", null),
      db
        .from("trips")
        .select("client_amount")
        .eq("tenant_id", tenantId)
        .eq("operational_status", "completed")
        .in("financial_status", ["pending", "partially_paid"])
        .not("client_amount", "is", null)
    ]);

    if (totalRes.error || completedRes.error || driversRes.error || revenueRes.error || receivableRes.error) {
      return fail("REPORT_FAILED", "Falha ao gerar relatorio operacional", 500);
    }

    const sumAmounts = (rows: { client_amount: number | string | null }[] | null) =>
      (rows ?? []).reduce((s, r) => s + (Number(r.client_amount) || 0), 0);

    const monthRevenue = Math.round(sumAmounts(revenueRes.data as { client_amount: number }[] | null) * 100) / 100;
    const receivable = Math.round(sumAmounts(receivableRes.data as { client_amount: number }[] | null) * 100) / 100;

    return ok({
      totalTrips: totalRes.count ?? 0,
      completedTrips: completedRes.count ?? 0,
      activeDrivers: driversRes.count ?? 0,
      monthRevenue,
      receivable
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) {
      return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    }
    return fail("INVALID_REQUEST", message, 400);
  }
}
