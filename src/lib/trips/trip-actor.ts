import { db } from "@/lib/server/db";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";

const STAFF = ["admin", "operador", "financeiro"];

/** Carrega a corrida e diz se quem chama é o motorista dela ou alguém da central. */
export async function loadTripForActor(id: string, columns: string) {
  const session = await withResolvedDriverId(await getSessionContext());
  const tenantId = assertTenantScope(session);
  const { data: trip } = await db.from("trips").select(`id, tenant_id, driver_id, client_id, ${columns}`).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!trip) return { ok: false as const, error: "notfound" as const };
  const row = trip as unknown as Record<string, unknown>;
  const isDriver = session.role === "motorista" && Boolean(session.driverId) && row.driver_id === session.driverId;
  const isStaff = STAFF.includes(session.role);
  if (!isDriver && !isStaff) return { ok: false as const, error: "forbidden" as const };
  return { ok: true as const, trip: row, session, tenantId, isDriver, isStaff };
}
