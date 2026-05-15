import type { SessionContext } from "@/lib/domain/types";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";

/**
 * Tenant ativo para consultas com service role (multiempresa).
 * Convidados: 403 via `assertCapability` antes; se chegar aqui, usa default monotenant.
 */
export function assertTenantScope(session: SessionContext): string {
  if (session.role === "guest") {
    throw new Error("Forbidden: autenticacao necessaria");
  }
  return session.tenantId ?? DEFAULT_TENANT_ID;
}
