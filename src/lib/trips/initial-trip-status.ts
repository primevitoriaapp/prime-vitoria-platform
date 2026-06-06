import type { SessionContext, UserRole } from "../domain/types";

const TRIP_WRITE_ROLES = new Set<UserRole>(["admin", "operador"]);

/** Portal cliente → solicitação; painel admin/operador → já aprovada. */
export function initialTripOperationalStatus(creatorRole: UserRole): "requested" | "approved" {
  return creatorRole === "cliente" ? "requested" : "approved";
}

/** Status inicial com base no papel efectivo da sessão. */
export function initialTripOperationalStatusForSession(session: SessionContext): "requested" | "approved" {
  return TRIP_WRITE_ROLES.has(session.role) ? "approved" : "requested";
}

export function initialTripApprovalFields(
  creatorRole: UserRole,
  actorUserId: string
): { approved_by?: string; approved_at?: string } {
  if (creatorRole === "cliente") return {};
  const now = new Date().toISOString();
  return { approved_by: actorUserId, approved_at: now };
}

export function initialTripApprovalFieldsForSession(
  session: SessionContext,
  actorUserId: string
): { approved_by?: string; approved_at?: string } {
  if (!TRIP_WRITE_ROLES.has(session.role)) return {};
  const now = new Date().toISOString();
  return { approved_by: actorUserId, approved_at: now };
}
