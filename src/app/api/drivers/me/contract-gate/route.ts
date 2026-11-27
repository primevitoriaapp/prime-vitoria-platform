import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { driverContractGate } from "@/lib/drivers/contract-gate";

/** O motorista logado precisa assinar o contrato antes de aceitar corridas? */
export async function GET() {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só motorista", 403);
    return ok(await driverContractGate(session.driverId));
  } catch (e) {
    return mapApiError(e);
  }
}
