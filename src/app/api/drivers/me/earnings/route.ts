import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { summarizeDriverEarnings } from "@/lib/drivers/driver-earnings";

/** App do parceiro: quanto ganhou hoje e no mês, o previsto e o que falta receber. Funcionário não vê. */
export async function GET() {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Apenas motoristas", 403);
    const tenantId = assertTenantScope(session);
    const { data: driver } = await db.from("drivers").select("employment_type").eq("id", session.driverId).maybeSingle();
    if (driver?.employment_type === "funcionario") return fail("FORBIDDEN", "Motorista funcionário não vê valores", 403);

    const since = new Date(Date.now() - 62 * 86400_000).toISOString();
    const [{ data: trips }, { data: payables }] = await Promise.all([
      db
        .from("trips")
        .select("id, scheduled_at, driver_amount, operational_status")
        .eq("tenant_id", tenantId)
        .eq("driver_id", session.driverId)
        .gte("scheduled_at", since)
        .limit(2000),
      db
        .from("driver_payables")
        .select("amount, status, trip_id")
        .eq("tenant_id", tenantId)
        .eq("driver_id", session.driverId)
        .neq("status", "cancelled")
        .limit(2000)
    ]);
    const tripIds = (payables ?? []).map((p) => p.trip_id).filter(Boolean) as string[];
    const { data: recs } = tripIds.length
      ? await db.from("accounts_receivable").select("trip_id, status").in("trip_id", tripIds)
      : { data: [] as { trip_id: string; status: string }[] };
    const recByTrip = new Map((recs ?? []).map((r) => [r.trip_id as string, r.status as string]));

    return ok(
      summarizeDriverEarnings(
        (trips ?? []) as { scheduled_at: string; driver_amount: number | null; operational_status: string }[],
        (payables ?? []).map((p) => ({ amount: p.amount as number, status: p.status as string, receivable_status: recByTrip.get(p.trip_id as string) ?? null }))
      )
    );
  } catch (error) {
    return mapApiError(error);
  }
}
