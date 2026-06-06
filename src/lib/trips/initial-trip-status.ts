import type { UserRole } from "@/lib/domain/types";

/** Portal cliente → solicitação; painel admin/operador → já aprovada. */
export function initialTripOperationalStatus(creatorRole: UserRole): "requested" | "approved" {
  return creatorRole === "cliente" ? "requested" : "approved";
}

export function initialTripApprovalFields(
  creatorRole: UserRole,
  actorUserId: string
): { approved_by?: string; approved_at?: string } {
  if (creatorRole === "cliente") return {};
  const now = new Date().toISOString();
  return { approved_by: actorUserId, approved_at: now };
}
