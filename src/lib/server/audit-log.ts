import { db } from "./db";
import { getClientIp } from "@/lib/security/integration-guard";

export type AuditPayload = {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request | null;
};

/**
 * Regista evento de auditoria. Falhas são registadas em consola (não bloqueia a operação principal).
 */
export async function insertAuditEvent(payload: AuditPayload): Promise<void> {
  const { tenantId, actorUserId, action, entityType, entityId, metadata, request } = payload;
  const ip = request ? getClientIp(request) : null;
  const userAgent = request?.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { error } = await db.from("audit_events").insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    metadata: metadata ?? {},
    ip: ip ?? null,
    user_agent: userAgent
  });

  if (error) {
    console.error("[audit_events]", action, entityType, error.message);
  }
}
