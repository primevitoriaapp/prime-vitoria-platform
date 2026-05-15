import test from "node:test";
import assert from "node:assert/strict";
import { fcmDataFromPayload, parseFcmLegacySendJson } from "../src/lib/notifications/fcm-legacy.ts";

test("fcmDataFromPayload stringifies nested values", () => {
  const d = fcmDataFromPayload({ a: "x", b: 1, c: { z: true } });
  assert.equal(d.a, "x");
  assert.equal(d.b, "1");
  assert.equal(d.c, '{"z":true}');
});

test("parseFcmLegacySendJson success when success count positive", () => {
  const r = parseFcmLegacySendJson({ multicast_id: 1, success: 1, failure: 0, results: [{ message_id: "m1" }] });
  assert.equal(r.ok, true);
});

test("parseFcmLegacySendJson failure reads results error", () => {
  const r = parseFcmLegacySendJson({ success: 0, failure: 1, results: [{ error: "NotRegistered" }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /NotRegistered/);
});

test("parseFcmLegacySendJson failure without results", () => {
  const r = parseFcmLegacySendJson({ success: 0, failure: 1, results: [] });
  assert.equal(r.ok, false);
});
