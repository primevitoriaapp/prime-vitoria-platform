import { isClientPortalReadOnly } from "@/lib/client/portal-config";
import { db } from "@/lib/server/db";

/** Lê flag do cliente; null se coluna ausente ou registo não encontrado. */
export async function getClientPortalRequestsEnabled(
  clientId: string,
  tenantId: string
): Promise<boolean | null> {
  const { data, error } = await db
    .from("clients")
    .select("portal_requests_enabled")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) return null;
  return Boolean(data.portal_requests_enabled);
}

export async function assertClientMayUsePortalWrites(clientId: string, tenantId: string): Promise<void> {
  const enabled = await getClientPortalRequestsEnabled(clientId, tenantId);
  if (isClientPortalReadOnly({ portalRequestsEnabled: enabled })) {
    throw new Error("Forbidden: solicitações no portal desactivadas para este cliente");
  }
}
