import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { listOpenOffersForDriver } from "@/lib/dispatch/list-trip-offers";

/** Ofertas abertas para o motorista da sessão (PWA) ou preview admin. */
export async function GET(request: Request) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    const requested = new URL(request.url).searchParams.get("driver_id") ?? undefined;

    let driverId = session.driverId;
    if (session.role === "admin" || session.role === "operador") {
      assertCapability(session, "trip.read");
      driverId = requested ?? driverId ?? undefined;
    } else {
      assertCapability(session, "trip.accept");
      if (!driverId) {
        return fail("FORBIDDEN", "Motorista precisa de cadastro vinculado a sessao", 403);
      }
    }

    if (!driverId) {
      return fail("DRIVER_ID_REQUIRED", "Informe driver_id para listar ofertas", 400);
    }

    const tenantId = assertTenantScope(session);
    const items = await listOpenOffersForDriver(driverId, tenantId);
    return ok({ items });
  } catch (error) {
    return mapApiError(error);
  }
}
