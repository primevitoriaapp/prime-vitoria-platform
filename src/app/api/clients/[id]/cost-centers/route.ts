import { z } from "zod";
import { canManageClientTeam } from "@/lib/clients/client-portal-team-access";
import { createCostCenter, listCostCenters } from "@/lib/clients/client-cost-centers";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";

const createSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().nullable(),
  responsible_name: z.string().optional().nullable(),
  responsible_email: z.string().email().optional().nullable().or(z.literal("")),
  active: z.boolean().optional()
});

async function assertClient(id: string, tenantId: string) {
  const { data } = await db
    .from("clients")
    .select("id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    if (session.role === "cliente") {
      if (!session.clientId || session.clientId !== id) {
        return fail("FORBIDDEN", "Acesso restrito", 403);
      }
    } else {
      assertCapability(session, "client.read");
    }

    if (!(await assertClient(id, tenantId))) {
      return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);
    }

    const rows = await listCostCenters(id, { activeOnly: session.role === "cliente" });
    return ok(rows);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    if (session.role === "cliente") {
      if (!session.clientId || session.clientId !== id) {
        return fail("FORBIDDEN", "Acesso restrito", 403);
      }
      if (!(await canManageClientTeam(session, id))) {
        return fail("FORBIDDEN", "Apenas administradores do cliente podem editar centros de custo", 403);
      }
    } else {
      assertCapability(session, "client.write");
    }

    const client = await assertClient(id, tenantId);
    if (!client) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);

    const body = createSchema.parse(await request.json());
    const { data, error } = await createCostCenter(id, client.tenant_id as string, {
      ...body,
      responsible_email: body.responsible_email || null
    });
    if (error) return fail("COST_CENTER_CREATE_FAILED", error.message, 500);
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
