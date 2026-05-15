import { db } from "@/lib/server/db";
import type { SessionContext } from "@/lib/domain/types";
import { loadDispatchAutomationSettings } from "@/lib/dispatch/auto-offer-after-approve";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
import { notifyOperationalClaimTaken } from "@/lib/notifications/operational-notify";
import type { ClaimGuardResult } from "@/lib/trips/operational-claim-guard";

/**
 * Garante claim activo antes de mutações operacionais.
 * - Admin: sempre OK.
 * - Operador sem claim + `require_operational_claim=false`: auto-assume (rastreio suave).
 * - Operador sem claim + require=true: CLAIM_REQUIRED.
 * - Outro operador com claim: CLAIM_NOT_OWNER.
 */
export async function ensureOperationalClaimForMutation(
  session: SessionContext,
  tenantId: string,
  tripId: string,
  request?: Request
): Promise<ClaimGuardResult> {
  if (session.role === "admin") return { ok: true };
  if (session.role !== "operador") return { ok: true };

  const settings = await loadDispatchAutomationSettings(tenantId);

  const { data: claim } = await db
    .from("trip_operational_claims")
    .select("id, operator_profile_id, claimed_at")
    .eq("trip_id", tripId)
    .eq("tenant_id", tenantId)
    .is("released_at", null)
    .maybeSingle();

  if (!claim) {
    if (settings.require_operational_claim) {
      return {
        ok: false,
        code: "CLAIM_REQUIRED",
        message: "Assuma o atendimento desta viagem antes de executar esta acção (multiatendimento)."
      };
    }

    const { data: row, error } = await db
      .from("trip_operational_claims")
      .insert({
        tenant_id: tenantId,
        trip_id: tripId,
        operator_profile_id: session.userId
      })
      .select("id, operator_profile_id, claimed_at")
      .single();

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        const { data: again } = await db
          .from("trip_operational_claims")
          .select("operator_profile_id")
          .eq("trip_id", tripId)
          .eq("tenant_id", tenantId)
          .is("released_at", null)
          .maybeSingle();
        if (again?.operator_profile_id === session.userId) return { ok: true };
        if (again) {
          return {
            ok: false,
            code: "CLAIM_NOT_OWNER",
            message: "Outro operador tem o atendimento desta viagem."
          };
        }
      }
      return { ok: false, code: "CLAIM_REQUIRED", message: error.message };
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.operational_claim_auto",
      entityType: "trip",
      entityId: tripId,
      metadata: { claim_id: row.id },
      request
    });

    const { data: claimerProfile } = await db.from("profiles").select("name").eq("id", session.userId).maybeSingle();
    await notifyOperationalClaimTaken(tenantId, tripId, session.userId, {
      claimer_name: (claimerProfile?.name as string | undefined) ?? undefined
    }).catch(() => undefined);

    return { ok: true };
  }

  if (claim.operator_profile_id !== session.userId) {
    return {
      ok: false,
      code: "CLAIM_NOT_OWNER",
      message: "Outro operador tem o atendimento desta viagem. Libertar ou contactar administrador."
    };
  }

  return { ok: true };
}
