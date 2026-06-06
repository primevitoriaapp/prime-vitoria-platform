import type { SessionContext } from "@/lib/domain/types";

/** Tenant da corrida: sempre o do cadastro do cliente (portal incluído). */
export function resolveTripTenantId(
  session: SessionContext,
  clientTenantId: string | null | undefined,
  sessionTenantId: string
): string {
  const clientTenant = (clientTenantId?.trim() || sessionTenantId) as string;

  if (session.role === "cliente") {
    return clientTenant;
  }

  if (clientTenant !== sessionTenantId) {
    throw new Error("Forbidden: Cliente nao pertence a esta organizacao");
  }

  return clientTenant;
}
