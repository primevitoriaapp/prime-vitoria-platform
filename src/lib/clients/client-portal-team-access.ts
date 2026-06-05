import type { SessionContext } from "@/lib/domain/types";
import { resolveCostCenterScopeForEmail } from "@/lib/clients/client-cost-centers";

/** Admin corporativo do cliente (não é só responsável de um centro de custo). */
export async function canManageClientTeam(
  session: SessionContext,
  clientId: string
): Promise<boolean> {
  if (session.role === "admin" || session.role === "operador") return true;
  if (session.role !== "cliente") return false;
  if (!session.clientId || session.clientId !== clientId) return false;
  const scopedCenter = await resolveCostCenterScopeForEmail(clientId, session.email);
  return !scopedCenter;
}
