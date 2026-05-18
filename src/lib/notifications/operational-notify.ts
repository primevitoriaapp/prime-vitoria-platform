import { enqueueInAppForTenantRoles } from "./enqueue-for-profiles";
import { operationalTripStatusEventType, type OperationalTripStatusEvent } from "./operational-status-event";

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

/** Despacho com motorista atribuído (painel directo ou aprovação de oferta) — visibilidade para equipa operacional. */
export async function notifyTripDispatchedToStaff(
  tenantId: string,
  tripId: string,
  driverId: string,
  opts?: { dispatch_mode?: "directed" | "offer"; excludeActorProfileId?: string }
): Promise<number> {
  const exclude = opts?.excludeActorProfileId ? [opts.excludeActorProfileId] : undefined;
  return enqueueInAppForTenantRoles(
    tenantId,
    [...STAFF_ROLES],
    {
      eventType: "operations.trip_dispatched",
      tripId,
      driver_id: driverId,
      dispatch_mode: opts?.dispatch_mode ?? "directed"
    },
    {
      correlation_id: `trip-${tripId}-staff-dispatch-${driverId}`,
      excludeProfileIds: exclude
    }
  );
}

/** Reatribuição de motorista — aviso in-app à equipa (exclui quem executou a acção). */
export async function notifyTripReassignedToStaff(
  tenantId: string,
  tripId: string,
  newDriverId: string,
  previousDriverId: string | null,
  opts?: { excludeActorProfileId?: string }
): Promise<number> {
  const exclude = opts?.excludeActorProfileId ? [opts.excludeActorProfileId] : undefined;
  return enqueueInAppForTenantRoles(
    tenantId,
    [...STAFF_ROLES],
    {
      eventType: "operations.trip_reassigned",
      tripId,
      new_driver_id: newDriverId,
      previous_driver_id: previousDriverId
    },
    {
      correlation_id: `trip-${tripId}-staff-reassign-${newDriverId}`,
      excludeProfileIds: exclude
    }
  );
}

/** Mudanças operacionais relevantes para a equipa (cancelamento, deslocamento, chegada, no-show). */
export async function notifyTripStatusToStaff(
  tenantId: string,
  tripId: string,
  status: OperationalTripStatusEvent,
  opts?: { driver_id?: string | null; excludeActorProfileId?: string }
): Promise<number> {
  const exclude = opts?.excludeActorProfileId ? [opts.excludeActorProfileId] : undefined;
  return enqueueInAppForTenantRoles(
    tenantId,
    [...STAFF_ROLES],
    {
      eventType: operationalTripStatusEventType(status),
      tripId,
      status,
      driver_id: opts?.driver_id ?? null
    },
    {
      correlation_id: `trip-${tripId}-staff-status-${status}`,
      excludeProfileIds: exclude
    }
  );
}
