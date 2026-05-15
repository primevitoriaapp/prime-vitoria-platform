import { enqueueInAppForTenantRoles } from "./enqueue-for-profiles";

const STAFF_ROLES = ["admin", "operador"] as const;

/** Nova corrida na fila (solicitação do cliente ou operador). */
export async function notifyTripRequested(
  tenantId: string,
  tripId: string,
  opts?: { client_id?: string }
): Promise<number> {
  return enqueueInAppForTenantRoles(
    tenantId,
    [...STAFF_ROLES],
    {
      eventType: "operations.trip_requested",
      tripId,
      client_id: opts?.client_id
    },
    { correlation_id: `trip-${tripId}-requested` }
  );
}

/** Corrida aprovada — pronta para despacho / claim. */
export async function notifyTripApproved(tenantId: string, tripId: string): Promise<number> {
  return enqueueInAppForTenantRoles(
    tenantId,
    [...STAFF_ROLES],
    {
      eventType: "operations.trip_approved",
      tripId
    },
    { correlation_id: `trip-${tripId}-approved` }
  );
}

/** Outro operador assumiu o atendimento (multiatendimento). */
export async function notifyOperationalClaimTaken(
  tenantId: string,
  tripId: string,
  claimerProfileId: string,
  opts?: { claimer_name?: string }
): Promise<number> {
  return enqueueInAppForTenantRoles(
    tenantId,
    [...STAFF_ROLES],
    {
      eventType: "operations.trip_claimed",
      tripId,
      claimer_profile_id: claimerProfileId,
      claimer_name: opts?.claimer_name
    },
    {
      correlation_id: `trip-${tripId}-claim-${claimerProfileId}`,
      excludeProfileIds: [claimerProfileId]
    }
  );
}
