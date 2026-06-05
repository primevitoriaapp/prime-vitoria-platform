import { z } from "zod";
import { canManageClientTeam } from "@/lib/clients/client-portal-team-access";
import { getClientTenantId } from "@/lib/clients/client-tenant";
import { updateClientPassenger } from "@/lib/clients/client-passengers";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  matricula: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
  active: z.boolean().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; passengerId: string }> }
) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id, passengerId } = await params;

    if (session.role === "cliente") {
      if (!session.clientId || session.clientId !== id) {
        return fail("FORBIDDEN", "Acesso restrito", 403);
      }
      if (!(await canManageClientTeam(session, id))) {
        return fail("FORBIDDEN", "Apenas administradores do cliente podem editar a equipe", 403);
      }
    } else {
      assertCapability(session, "client.write");
    }

    const { data: clientRow } = await db
      .from("clients")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!clientRow) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);

    const body = patchSchema.parse(await request.json());
    const clientTenantId = await getClientTenantId(id, tenantId);
    const { data, error } = await updateClientPassenger(passengerId, id, clientTenantId, body);
    if (error) return fail("PASSENGER_UPDATE_FAILED", error.message, 500);
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
