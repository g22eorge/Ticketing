/**
 * rate-limit.ts
 *
 * In-memory sliding-window rate limiter.
 * Suitable for single-server deployments (SQLite / Railway / Render).
 * Entries self-expire on the next check — no background cleanup needed.
 *
 * For multi-server deployments, swap the `store` Map for a Redis/Upstash
 * client without changing any call sites.
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

// ── Named limit profiles ──────────────────────────────────────────────────────

/**
 * Profiles — pick the one that matches the sensitivity of the endpoint.
 *
 * Usage:
 *   const result = rateLimit.auth(ip);
 *   if (!result.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */
export const rateLimit = {
  /** Login / register — 10 attempts per 15 minutes per IP. */
  auth: (ip: string) =>
    checkRateLimit(`auth:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 }),

  /** Public intake / repair-request form — 5 submissions per hour per IP. */
  publicForm: (ip: string) =>
    checkRateLimit(`form:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 }),

  /** Invite generation — 20 invites per hour per org. */
  invite: (orgId: string) =>
    checkRateLimit(`invite:${orgId}`, { limit: 20, windowMs: 60 * 60 * 1000 }),

  /** Job creation — 60 jobs per hour per org (well above any real usage). */
  jobCreate: (orgId: string) =>
    checkRateLimit(`job:${orgId}`, { limit: 60, windowMs: 60 * 60 * 1000 }),

  /** File uploads — 30 uploads per 10 minutes per user. */
  upload: (userId: string) =>
    checkRateLimit(`upload:${userId}`, { limit: 30, windowMs: 10 * 60 * 1000 }),

  /** Webhook endpoints — 200 per minute per IP (Pesapal IPN callbacks). */
  webhook: (ip: string) =>
    checkRateLimit(`webhook:${ip}`, { limit: 200, windowMs: 60 * 1000 }),

  /** General API — 100 requests per minute per IP. */
  api: (ip: string) =>
    checkRateLimit(`api:${ip}`, { limit: 100, windowMs: 60 * 1000 }),
} as const;

// ── IP extraction helper ──────────────────────────────────────────────────────

/**
 * Extract the real client IP from a Next.js request or Request object.
 * Falls back to a safe sentinel value so rate limiting still works.
 */
export function getClientIp(
  req: { headers: { get(name: string): string | null } },
): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
