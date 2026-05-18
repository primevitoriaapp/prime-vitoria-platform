import { enqueueNotificationJob } from "./events";
import { enqueueInAppForTenantRoles } from "./enqueue-for-profiles";
import { driverStatusPushEventType } from "./driver-status-event";

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
  const driverPushEventType = driverStatusPushEventType(toStatus, fromStatus, trip.driver_id);

  if (toStatus === "completed") {
    if (trip.driver_id && driverPushEventType) {
      await enqueueNotificationJob(
        {
          eventType: driverPushEventType,
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

  if ((toStatus === "cancelled" || toStatus === "no_show") && trip.driver_id && driverPushEventType) {
    await enqueueNotificationJob(
      {
        eventType: driverPushEventType,
        channel: "push",
        recipientType: "driver",
        recipientId: trip.driver_id,
        ...base
      },
      { tenantId, correlation_id: `trip-${trip.id}-${toStatus}` }
    );
    return;
  }

  if (toStatus === "dispatched" && trip.driver_id && driverPushEventType) {
    await enqueueNotificationJob(
      {
        eventType: driverPushEventType,
        channel: "push",
        recipientType: "driver",
        recipientId: trip.driver_id,
        ...base
      },
      { tenantId, correlation_id: `trip-${trip.id}-dispatched` }
    );
  }
}
