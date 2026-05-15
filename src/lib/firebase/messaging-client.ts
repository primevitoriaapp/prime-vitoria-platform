"use client";

import { readFirebaseWebConfig, type FirebaseWebConfig } from "./messaging-config";

let messagingPromise: Promise<string | null> | null = null;

/**
 * Obtem token FCM no browser (Firebase Messaging). Requer permissao de notificacao concedida.
 * Retorna null se env incompleta, SW indisponivel ou utilizador negou permissao.
 */
export async function obtainFcmRegistrationToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const config = readFirebaseWebConfig();
  if (!config) return null;
  if (!("Notification" in window)) return null;
  if (!("serviceWorker" in navigator)) return null;

  if (!messagingPromise) {
    messagingPromise = loadToken(config);
  }
  return messagingPromise;
}

async function loadToken(config: FirebaseWebConfig): Promise<string | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register("/driver/service-worker.js", {
    scope: "/driver/"
  });
  await navigator.serviceWorker.ready;

  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");

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
  const token = await getToken(messaging, {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration
  });

  return token?.trim() || null;
}

export function resetFcmTokenCache(): void {
  messagingPromise = null;
}
