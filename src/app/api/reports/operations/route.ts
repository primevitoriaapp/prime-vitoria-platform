import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "report.read");

    const [{ count: totalTrips }, { count: completedTrips }, { count: activeDrivers }] = await Promise.all([
      db.from("trips").select("id", { count: "exact", head: true }),
      db.from("trips").select("id", { count: "exact", head: true }).eq("operational_status", "completed"),
      db.from("drivers").select("id", { count: "exact", head: true }).eq("active", true)
    ]);

    if (totalTrips.error || completedTrips.error || activeDrivers.error) {
      return fail("REPORT_FAILED", "Failed to generate operations report", 500);
    }

    return ok({
      totalTrips: totalTrips.count ?? 0,
      completedTrips: completedTrips.count ?? 0,
      activeDrivers: activeDrivers.count ?? 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Forbidden:")) {
      return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
    }
    return fail("INVALID_REQUEST", message, 400);
  }
}
