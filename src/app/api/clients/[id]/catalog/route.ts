import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { loadClientCatalog } from "@/lib/pricing/vehicle-categories";

/** Veículos e serviços liberados para a empresa pedir no portal. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const staff = session.role === "admin" || session.role === "operador";
    if (!staff && !(session.role === "cliente" && session.clientId === id)) return fail("FORBIDDEN", "Sem acesso", 403);
    return ok(await loadClientCatalog(tenantId, id));
  } catch (error) {
    return mapApiError(error);
  }
}
