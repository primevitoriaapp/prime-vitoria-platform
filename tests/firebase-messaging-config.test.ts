import test from "node:test";
import assert from "node:assert/strict";
import { readFirebaseWebConfig } from "../src/lib/firebase/messaging-config.ts";

test("readFirebaseWebConfig null when env incomplete", () => {
  const prev = { ...process.env };
  delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  delete process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  delete process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  delete process.env.NEXT_PUBLIC_FCM_VAPID_KEY;
  try {
    assert.equal(readFirebaseWebConfig(), null);
  } finally {
    Object.assign(process.env, prev);
  }
});

test("readFirebaseWebConfig returns object when all set", () => {
  const prev = { ...process.env };
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "k";
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "d";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "p";
  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "s";
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "a";
  process.env.NEXT_PUBLIC_FCM_VAPID_KEY = "v";
  try {
    const cfg = readFirebaseWebConfig();
    assert.ok(cfg);
    assert.equal(cfg.projectId, "p");
  } finally {
    Object.assign(process.env, prev);
  }
});
