import { db } from "../server/db";
import { driverDispatchedPushPayload } from "./driver-status-event";
import { fcmDataFromPayload, sendFcmLegacyDataMessage } from "./fcm-legacy";

export type SendDriverPushResult = { ok: true } | { ok: false; reason: string };

/** Envia push FCM ao motorista imediatamente (sem fila / cron). */
export async function sendDriverPushNow(
  tenantId: string,
  driverId: string,
  payload: Record<string, unknown>
): Promise<SendDriverPushResult> {
  const fcmKey = process.env.FCM_SERVER_KEY?.trim();
  if (!fcmKey) {
    return { ok: false, reason: "FCM_SERVER_KEY nao configurado" };
  }

  const { data: tokenRow, error } = await db
    .from("driver_push_tokens")
    .select("token")
    .eq("driver_id", driverId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: error.message };
  }

  const token = tokenRow?.token?.trim();
  if (!token) {
    return { ok: false, reason: "NO_DEVICE_PUSH_TOKEN" };
  }

  const send = await sendFcmLegacyDataMessage({
    serverKey: fcmKey,
    registrationToken: token,
    data: fcmDataFromPayload(payload)
  });

  return send.ok ? { ok: true } : { ok: false, reason: send.reason };
}

/** Notifica motorista de corrida despachada (push imediato). */
export async function notifyDriverDispatchedNow(
  tenantId: string,
  driverId: string,
  tripId: string
): Promise<SendDriverPushResult> {
  return sendDriverPushNow(tenantId, driverId, driverDispatchedPushPayload(driverId, tripId));
}
