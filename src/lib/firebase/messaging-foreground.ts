"use client";

import { readFirebaseWebConfig } from "./messaging-config";

export const DRIVER_PUSH_EVENT = "pv-driver-push";

export type DriverPushDetail = {
  tripId?: string;
  title?: string;
  body?: string;
  eventType?: string;
};

/** Dispara refresh das listas motorista quando chega push com app aberta. */
export function dispatchDriverPushEvent(detail: DriverPushDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DRIVER_PUSH_EVENT, { detail }));
}

/**
 * Escuta mensagens FCM em foreground (app aberta). Retorna cleanup.
 */
export async function setupForegroundMessaging(
  onPayload: (detail: DriverPushDetail) => void
): Promise<(() => void) | null> {
  if (typeof window === "undefined") return null;
  const config = readFirebaseWebConfig();
  if (!config) return null;
  if (!("Notification" in window) || Notification.permission !== "granted") return null;

  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");

  if (!(await isSupported())) return null;

  const app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId
        });

  const messaging = getMessaging(app);
  const unsubscribe = onMessage(messaging, (payload) => {
    const data = (payload.data ?? {}) as Record<string, string>;
    const detail: DriverPushDetail = {
      tripId: data.tripId,
      title: data.title ?? payload.notification?.title,
      body: data.body ?? payload.notification?.body,
      eventType: data.eventType
    };
    onPayload(detail);
    dispatchDriverPushEvent(detail);
  });

  return () => unsubscribe();
}
