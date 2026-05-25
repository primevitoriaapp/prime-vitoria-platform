import { readFirebaseWebConfig } from "../firebase/messaging-config.ts";

export type PushReadinessSnapshot = {
  /** Servidor pode enviar FCM legacy */
  serverConfigured: boolean;
  /** Browser pode auto-registar token (env públicas) */
  firebaseWebConfigured: boolean;
  /** Pronto para smoke push ponta-a-ponta */
  operationalReady: boolean;
};

export function getPushReadinessSnapshot(): PushReadinessSnapshot {
  const serverConfigured = Boolean(process.env.FCM_SERVER_KEY?.trim());
  const firebaseWebConfigured = Boolean(readFirebaseWebConfig());
  return {
    serverConfigured,
    firebaseWebConfigured,
    operationalReady: serverConfigured && firebaseWebConfigured
  };
}
