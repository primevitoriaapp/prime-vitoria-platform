import test from "node:test";
import assert from "node:assert/strict";
import { getPushReadinessSnapshot } from "../src/lib/notifications/push-readiness.ts";

test("getPushReadinessSnapshot reflects env", () => {
  const prev = process.env.FCM_SERVER_KEY;
  delete process.env.FCM_SERVER_KEY;
  try {
    const snap = getPushReadinessSnapshot();
    assert.equal(snap.serverConfigured, false);
    assert.equal(snap.operationalReady, false);
  } finally {
    if (prev !== undefined) process.env.FCM_SERVER_KEY = prev;
    else delete process.env.FCM_SERVER_KEY;
  }
});

test("getPushReadinessSnapshot operational when server + firebase web", () => {
  const prev = {
    FCM_SERVER_KEY: process.env.FCM_SERVER_KEY,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FCM_VAPID_KEY: process.env.NEXT_PUBLIC_FCM_VAPID_KEY
  };
  process.env.FCM_SERVER_KEY = "key";
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "k";
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "d";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "p";
  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "s";
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "a";
  process.env.NEXT_PUBLIC_FCM_VAPID_KEY = "v";
  try {
    const snap = getPushReadinessSnapshot();
    assert.equal(snap.serverConfigured, true);
    assert.equal(snap.firebaseWebConfigured, true);
    assert.equal(snap.operationalReady, true);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
