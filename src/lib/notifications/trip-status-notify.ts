import { enqueueNotificationJob } from "./events";
import { enqueueInAppForTenantRoles } from "./enqueue-for-profiles";

type TripNotifyRow = {
  id: string;
  client_id: string;
  driver_id: string | null;
  operational_status: string;
};

/** Notificações pós-transição de estado (push motorista + in-app financeiro). */
export async function notifyTripStatusTransition(
  tenantId: string,
  trip: TripNotifyRow,
  fromStatus: string,
  toStatus: string
): Promise<void> {
  const base = { tripId: trip.id, fromStatus, toStatus };

  if (toStatus === "completed") {
    if (trip.driver_id) {
      await enqueueNotificationJob(
        {
          eventType: "trip.completed",
          channel: "push",
          recipientType: "driver",
          recipientId: trip.driver_id,
          ...base
        },
        { tenantId, correlation_id: `trip-${trip.id}-completed` }
      );
    }
    await enqueueInAppForTenantRoles(
      tenantId,
      ["financeiro", "admin"],
      {
        eventType: "trip.completed",
        ...base,
        client_id: trip.client_id
      },
      { correlation_id: `trip-${trip.id}-finance-completed` }
    );
    return;
  }

  if (toStatus === "cancelled" && trip.driver_id) {
    await enqueueNotificationJob(
      {
        eventType: "trip.cancelled",
        channel: "push",
        recipientType: "driver",
        recipientId: trip.driver_id,
        ...base
      },
      { tenantId, correlation_id: `trip-${trip.id}-cancelled` }
    );
    return;
  }

  if (toStatus === "dispatched" && trip.driver_id && fromStatus !== "dispatched") {
    await enqueueNotificationJob(
      {
        eventType: "trip.dispatched",
        channel: "push",
        recipientType: "driver",
        recipientId: trip.driver_id,
        ...base
      },
      { tenantId, correlation_id: `trip-${trip.id}-dispatched` }
    );
  }
}
