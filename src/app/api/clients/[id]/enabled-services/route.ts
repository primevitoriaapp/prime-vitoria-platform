import { getClientTenantId } from "@/lib/clients/client-tenant";
import { listClientPricingRules } from "@/lib/clients/client-pricing-rules";
import {
  PRIME_SERVICE_CATALOG,
  normalizePrimeServiceType,
  type PrimeServiceIcon
} from "@/lib/pricing/prime-service-catalog";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { db } from "@/lib/server/db";

export type EnabledServiceDto = {
  id: string;
  label: string;
  description: string;
  icon: PrimeServiceIcon;
};

async function assertClientAccess(
  session: Awaited<ReturnType<typeof getSessionContext>>,
  clientId: string,
  tenantId: string
) {
  if (session.role === "cliente") {
    if (!session.clientId || session.clientId !== clientId) {
      return fail("FORBIDDEN", "Acesso restrito ao seu cliente", 403);
    }
  } else {
    assertCapability(session, "client.read");
  }

  const { data } = await db.from("clients").select("id").eq("id", clientId).eq("tenant_id", tenantId).maybeSingle();
  if (!data) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);
  return null;
}

/** Serviços habilitados para portal / solicitação (sem valores). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const denied = await assertClientAccess(session, id, tenantId);
    if (denied) return denied;

    const clientTenantId = await getClientTenantId(id, tenantId);
    const rules = await listClientPricingRules(id, clientTenantId);
    const activeIds = new Set(
      rules
        .filter((r) => r.active)
        .map((r) => normalizePrimeServiceType(r.service_type))
    );

    const services: EnabledServiceDto[] = PRIME_SERVICE_CATALOG.filter((s) => activeIds.has(s.id)).map(
      (s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        icon: s.icon
      })
    );

    return ok(services);
  } catch (error) {
    return mapApiError(error);
  }
}
