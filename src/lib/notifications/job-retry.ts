export type NotificationFailureUpdate = {
  status: "queued" | "error";
  attempt_count: number;
  next_retry_at: string | null;
  last_error: string;
};

export function notificationFailureUpdate(input: {
  attemptCountBefore: number | null | undefined;
  maxAttempts: number | null | undefined;
  now: Date;
  lastError: string;
  retryable?: boolean;
}): NotificationFailureUpdate {
  const attempt_count = Math.max(0, input.attemptCountBefore ?? 0) + 1;
  const maxAttempts = Math.max(1, input.maxAttempts ?? 5);
  const retryable = input.retryable ?? true;

  if (!retryable || attempt_count >= maxAttempts) {
    return {
      status: "error",
      attempt_count,
      next_retry_at: null,
      last_error: input.lastError
    };
  }

  return {
    status: "queued",
    attempt_count,
    next_retry_at: new Date(input.now.getTime() + notificationRetryDelayMs(attempt_count)).toISOString(),
    last_error: input.lastError
  };
}

export function notificationRetryDelayMs(attemptCount: number): number {
  const baseMs = 60_000;
  const maxMs = 15 * 60_000;
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attemptCount - 1));
}
