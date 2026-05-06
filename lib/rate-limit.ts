/**
 * In-memory sliding-window rate limiter.
 * Suitable for single-server deployments (SQLite/Railway/Render).
 * Entries self-expire on the next check — no background cleanup needed.
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= opts.limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

export function rateLimitHeaders(retryAfterMs: number) {
  return {
    "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
    "X-RateLimit-Reset": String(Date.now() + retryAfterMs),
  };
}
