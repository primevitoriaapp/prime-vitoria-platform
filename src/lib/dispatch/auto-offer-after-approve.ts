import { listEligibleDriverIdsForScheduling } from "@/lib/dispatch/driver-availability";
import { runDispatchOfferRpcAndNotify } from "@/lib/dispatch/run-offer-creation";
import { db } from "@/lib/server/db";
import { insertAuditEvent } from "@/lib/server/audit-log";

export type DispatchAutomationRow = {
  auto_offer_on_approve: boolean;
  auto_direct_assign_on_approve: boolean;
  offer_expires_seconds: number;
  max_offer_candidates: number;
};

const DEFAULT_SETTINGS: DispatchAutomationRow = {
  auto_offer_on_approve: false,
  auto_direct_assign_on_approve: false,
  offer_expires_seconds: 180,
  max_offer_candidates: 8
};

export async function loadDispatchAutomationSettings(tenantId: string): Promise<DispatchAutomationRow> {
  const { data, error } = await db
    .from("dispatch_automation_settings")
    .select("auto_offer_on_approve, auto_direct_assign_on_approve, offer_expires_seconds, max_offer_candidates")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_SETTINGS;
  }
  let auto_offer_on_approve = Boolean(data.auto_offer_on_approve);
  const auto_direct_assign_on_approve = Boolean(data.auto_direct_assign_on_approve);
  // Invariante operacional: nunca ambos ativos (BD + API; leitura defensiva se dados legados).
  if (auto_offer_on_approve && auto_direct_assign_on_approve) {
    auto_offer_on_approve = false;
  }
  return {
    auto_offer_on_approve,
    auto_direct_assign_on_approve,
    offer_expires_seconds: data.offer_expires_seconds ?? DEFAULT_SETTINGS.offer_expires_seconds,
    max_offer_candidates: data.max_offer_candidates ?? DEFAULT_SETTINGS.max_offer_candidates
  };
}

/**
 * Após aprovação: se configurado, cria oferta aos motoristas elegíveis (sem conflito de agenda).
 */
export async function tryAutoDispatchOfferAfterApprove(opts: {
  tenantId: string;
  tripId: string;
  scheduledAtIso: string;
  actorUserId: string;
  request: Request;
}): Promise<void> {
  const { tenantId, tripId, scheduledAtIso, actorUserId, request } = opts;
  const settings = await loadDispatchAutomationSettings(tenantId);
  if (settings.auto_direct_assign_on_approve) {
    return;
  }
  if (!settings.auto_offer_on_approve) {
    return;
  }

  const candidates = await listEligibleDriverIdsForScheduling({
    tenantId,
    scheduledAtIso,
    maxCount: settings.max_offer_candidates
  });

  if (candidates.length === 0) {
    await insertAuditEvent({
      tenantId,
      actorUserId,
      action: "dispatch.auto_offer_skipped",
      entityType: "trip",
      entityId: tripId,
      metadata: { reason: "no_conflict_free_drivers" },
      request
    });
    return;
  }

  const created = await runDispatchOfferRpcAndNotify({
    tripId,
    tenantId,
    expiresInSeconds: settings.offer_expires_seconds,
    candidateDriverIds: candidates,
    createdByUserId: actorUserId
  });

  if (!created.ok) {
    await insertAuditEvent({
      tenantId,
      actorUserId,
      action: "dispatch.auto_offer_failed",
      entityType: "trip",
      entityId: tripId,
      metadata: { code: created.code, message: created.message, candidate_count: candidates.length },
      request
    });
    return;
  }

  await insertAuditEvent({
    tenantId,
    actorUserId,
    action: "dispatch.auto_offer_created",
    entityType: "dispatch_offer",
    entityId: created.offerId,
    metadata: { trip_id: tripId, candidate_count: candidates.length },
    request
  });
}
