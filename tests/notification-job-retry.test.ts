import test from "node:test";
import assert from "node:assert/strict";
import { notificationFailureUpdate, notificationRetryDelayMs } from "../src/lib/notifications/job-retry.ts";

test("notificationFailureUpdate queues retry before max attempts", () => {
  const update = notificationFailureUpdate({
    attemptCountBefore: 0,
    maxAttempts: 3,
    now: new Date("2026-01-01T00:00:00.000Z"),
    lastError: "FCM temporario"
  });
  assert.equal(update.status, "queued");
  assert.equal(update.attempt_count, 1);
  assert.equal(update.next_retry_at, "2026-01-01T00:01:00.000Z");
});

test("notificationFailureUpdate fails on final or non-retryable failure", () => {
  assert.deepEqual(
    notificationFailureUpdate({
      attemptCountBefore: 2,
      maxAttempts: 3,
      now: new Date("2026-01-01T00:00:00.000Z"),
      lastError: "sem token"
    }),
    { status: "error", attempt_count: 3, next_retry_at: null, last_error: "sem token" }
  );
  assert.equal(
    notificationFailureUpdate({
      attemptCountBefore: 0,
      maxAttempts: 3,
      now: new Date("2026-01-01T00:00:00.000Z"),
      lastError: "destinatario invalido",
      retryable: false
    }).status,
    "error"
  );
});

test("notificationRetryDelayMs uses capped exponential backoff", () => {
  assert.equal(notificationRetryDelayMs(1), 60_000);
  assert.equal(notificationRetryDelayMs(2), 120_000);
  assert.equal(notificationRetryDelayMs(10), 900_000);
});
