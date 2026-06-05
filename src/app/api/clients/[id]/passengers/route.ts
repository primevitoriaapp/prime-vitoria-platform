import { z } from "zod";
import { getClientTenantId } from "@/lib/clients/client-tenant";
import {
  createClientPassenger,
  listClientPassengers
} from "@/lib/clients/client-passengers";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability, can } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  matricula: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
  active: z.boolean().optional()
});

async function assertClientAccess(
  session: Awaited<ReturnType<typeof getSessionContext>>,
  clientId: string,
  tenantId: string,
  write = false
) {
  if (session.role === "cliente") {
    if (!session.clientId || session.clientId !== clientId) {
      return fail("FORBIDDEN", "Acesso restrito ao seu cliente", 403);
    }
    if (write) return fail("FORBIDDEN", "Cliente não pode editar funcionários", 403);
  } else {
    assertCapability(session, write ? "client.write" : "client.read");
  }

  const { data } = await db.from("clients").select("id").eq("id", clientId).eq("tenant_id", tenantId).maybeSingle();
  if (!data) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const denied = await assertClientAccess(session, id, tenantId);
    if (denied) return denied;

    const q = new URL(request.url).searchParams.get("q") ?? undefined;
    const clientTenantId = await getClientTenantId(id, tenantId);
    const rows = await listClientPassengers(id, clientTenantId, { q, activeOnly: true });
    return ok(rows);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const denied = await assertClientAccess(session, id, tenantId, true);
    if (denied) return denied;

    const body = createSchema.parse(await request.json());
    const clientTenantId = await getClientTenantId(id, tenantId);
    const { data, error } = await createClientPassenger(id, clientTenantId, body);
    if (error) {
      if (/client_passengers/i.test(error.message)) {
        return fail("PASSENGERS_SCHEMA_MISSING", error.message, 503, "Aplique migration 0055 no Supabase.");
      }
      return fail("PASSENGER_CREATE_FAILED", error.message, 500);
    }
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}
