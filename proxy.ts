// NOTE: Next.js 16 uses "proxy.ts" as the middleware entrypoint.
// Do not add a separate middleware.ts, or builds will fail.

import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const PUBLIC_PATHS = [
  // Auth
  "/login",
  "/register",
  "/invite",

  // API
  "/api/auth",
  "/api/login",
  "/api/webhooks",
  "/api/repair-requests",

  // Public forms & pages
  "/repair-request",
  "/repair",
  "/address",
  "/app",
  "/company",
  "/profile",
  "/terms",
  "/privacy",

  // Public metadata assets
  "/opengraph-image",
  "/twitter-image",
  "/apple-icon",
  "/icon.svg",
  "/eagle-info-logo.png",
];

/** Extract the best available client IP from request headers. */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = clientIp(req);

  // ── Rate limiting ───────────────────────────────────────────────────────────
  // Skip in CI so performance/smoke tests don't trip the brute-force limits.
  const skipRateLimit = process.env.CI === "true";

  // Auth endpoints: brute-force protection (10 req / 15 min per IP).
  if (!skipRateLimit && (pathname.startsWith("/api/auth") || pathname === "/login" || pathname === "/register")) {
    const { allowed, retryAfterMs } = checkRateLimit(`auth:${ip}`, {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: rateLimitHeaders(retryAfterMs) },
      );
    }
  }

  // Webhook endpoints: allow bursts but cap runaway callers (200 / min per IP).
  if (!skipRateLimit && pathname.startsWith("/api/webhooks")) {
    const { allowed, retryAfterMs } = checkRateLimit(`webhook:${ip}`, {
      limit: 200,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded." },
        { status: 429, headers: rateLimitHeaders(retryAfterMs) },
      );
    }
  }

  // Public intake form: 5 submissions per hour per IP.
  if (!skipRateLimit && pathname.startsWith("/repair-request")) {
    const { allowed, retryAfterMs } = checkRateLimit(`form:${ip}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429, headers: rateLimitHeaders(retryAfterMs) },
      );
    }
  }

  // General API: 100 req / min per IP (catches scrapers and runaway clients).
  if (
    !skipRateLimit &&
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/api/webhooks")
  ) {
    const { allowed, retryAfterMs } = checkRateLimit(`api:${ip}`, {
      limit: 100,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(retryAfterMs) },
      );
    }
  }

  // ── Auth gate ───────────────────────────────────────────────────────────────

  // Root landing page and all explicitly public paths are always accessible.
  if (pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = getSessionCookie(req);
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users without an org land on /onboarding.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|uploads).*)"],
};
