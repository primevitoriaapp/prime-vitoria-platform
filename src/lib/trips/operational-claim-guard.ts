import { db } from "@/lib/server/db";
import type { SessionContext } from "@/lib/domain/types";
import { loadDispatchAutomationSettings } from "@/lib/dispatch/auto-offer-after-approve";
import { operationalClaimConflictMessage } from "@/lib/trips/operational-claim-state";

export type ClaimGuardResult =
  | { ok: true }
  | { ok: false; code: "CLAIM_REQUIRED"; message: string }
  | { ok: false; code: "CLAIM_NOT_OWNER"; message: string };

/** Quando `require_operational_claim` está activo, operador precisa de claim activo na viagem. */
export async function assertOperationalClaimForAction(
  session: SessionContext,
  tenantId: string,
  tripId: string
): Promise<ClaimGuardResult> {
  if (session.role === "admin") return { ok: true };

  const settings = await loadDispatchAutomationSettings(tenantId);
  if (!settings.require_operational_claim) return { ok: true };

  if (session.role !== "operador") return { ok: true };

  const { data: claim } = await db
    .from("trip_operational_claims")
    .select("operator_profile_id, claimed_at")
    .eq("trip_id", tripId)
    .eq("tenant_id", tenantId)
    .is("released_at", null)
    .maybeSingle();

  if (!claim) {
    return {
      ok: false,
      code: "CLAIM_REQUIRED",
      message: "Assuma o atendimento desta viagem antes de executar esta acção (multiatendimento)."
    };
  }

  if (claim.operator_profile_id !== session.userId) {
    return {
      ok: false,
      code: "CLAIM_NOT_OWNER",
      message: operationalClaimConflictMessage((claim as { claimed_at?: string | null }).claimed_at ?? null)
    };
  }

  return { ok: true };
}
