const requestBuckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const bucket = requestBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= maxRequests) {
    throw new Error("Rate limit exceeded");
  }

  bucket.count += 1;
  requestBuckets.set(key, bucket);
}
