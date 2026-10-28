import { z } from "zod";
import { canManageClientTeam } from "@/lib/clients/client-portal-team-access";
import { grantPortalAccess, PortalAccessError, revokePortalAccess } from "@/lib/clients/client-portal-login";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const grantSchema = z.object({ passenger_id: z.string().uuid(), email: z.string().min(3).max(254) });
const revokeSchema = z.object({ passenger_id: z.string().uuid() });

function requestOrigin(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

async function guard(clientId: string) {
  const session = await getSessionContext();
  const tenantId = assertTenantScope(session);
  if (!(await canManageClientTeam(session, clientId))) {
    return { denied: fail("FORBIDDEN", "Só o gestor da conta pode dar acesso ao portal.", 403) } as const;
  }
  const { data } = await db.from("clients").select("id, tenant_id").eq("id", clientId).maybeSingle();
  if (!data || (session.role === "cliente" && data.tenant_id !== tenantId)) {
    return { denied: fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404) } as const;
  }
  return { session, tenantId: data.tenant_id as string } as const;
}

function mapPortalError(error: unknown) {
  if (error instanceof PortalAccessError) return fail(error.code, error.message, error.status);
  return mapApiError(error);
}

/** Gestor dá acesso ao portal a um funcionário (envia convite por e-mail). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const g = await guard(id);
    if ("denied" in g) return g.denied;
    enforceRateLimit(`portal-access:${g.session.userId}`, 20, 10 * 60_000);
    const body = grantSchema.parse(await request.json());
    const result = await grantPortalAccess({
      passengerId: body.passenger_id,
      clientId: id,
      tenantId: g.tenantId,
      email: body.email,
      origin: requestOrigin(request)
    });
    return ok(result);
  } catch (error) {
    return mapPortalError(error);
  }
}

/** Gestor tira o acesso ao portal de um funcionário. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const g = await guard(id);
    if ("denied" in g) return g.denied;
    const body = revokeSchema.parse(await request.json());
    await revokePortalAccess({ passengerId: body.passenger_id, clientId: id, tenantId: g.tenantId });
    return ok({ revoked: true });
  } catch (error) {
    return mapPortalError(error);
  }
}
