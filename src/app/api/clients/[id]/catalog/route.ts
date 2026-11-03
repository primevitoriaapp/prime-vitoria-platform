import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { loadClientCatalog } from "@/lib/pricing/vehicle-categories";
import { permissionForProfile } from "@/lib/clients/passenger-permissions";

/** Veículos e serviços liberados para a empresa pedir no portal. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const staff = session.role === "admin" || session.role === "operador";
    if (!staff && !(session.role === "cliente" && session.clientId === id)) return fail("FORBIDDEN", "Sem acesso", 403);
    const items = await loadClientCatalog(tenantId, id);
    // Funcionário só vê as categorias que o gestor liberou para ele.
    if (session.role === "cliente") {
      const perm = await permissionForProfile(id, session.userId);
      if (perm?.allowed) return ok(items.filter((c) => perm.allowed!.includes(c.id)));
    }
    return ok(items);
  } catch (error) {
    return mapApiError(error);
  }
}
