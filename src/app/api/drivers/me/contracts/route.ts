import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { syncPending, type ContractRow } from "@/lib/contracts/contracts";

/** Contratos do motorista logado: situação, link para assinar e para baixar. */
export async function GET() {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só motorista", 403);
    const { data } = await db.from("contracts").select("*").eq("driver_id", session.driverId).neq("status", "cancelado").order("created_at", { ascending: false });
    const rows = await syncPending((data ?? []) as ContractRow[]);
    return ok(rows.map((r) => ({ id: r.id, title: r.title, status: r.status, created_at: r.created_at, signed_at: r.signed_at, sign_url: r.status === "pendente" ? r.sign_url : null })));
  } catch (e) {
    return mapApiError(e);
  }
}
