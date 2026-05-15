/** Configuracao publica Firebase (Web Push / FCM). Todas obrigatorias para auto-registo no PWA. */
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

export function readFirebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY?.trim();

  if (!apiKey || !authDomain || !projectId || !messagingSenderId || !appId || !vapidKey) {
    return null;
  }

  return { apiKey, authDomain, projectId, messagingSenderId, appId, vapidKey };
}
