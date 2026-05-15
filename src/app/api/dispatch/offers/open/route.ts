import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { listOpenOffersForDriver } from "@/lib/dispatch/list-trip-offers";

/** Ofertas abertas para o motorista da sessão (PWA). */
export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.accept");
    if (!session.driverId) {
      return fail("FORBIDDEN", "Motorista precisa de cadastro vinculado a sessao", 403);
    }
    const tenantId = assertTenantScope(session);
    const items = await listOpenOffersForDriver(session.driverId, tenantId);
    return ok({ items });
  } catch (error) {
    return mapApiError(error);
  }
}
