import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/invite",          // invite accept pages are public
  "/api/auth",
  "/api/webhooks",
  "/repair-request",  // public intake form
];

const ONBOARDING_PATH = "/onboarding";

/** Extract the best available client IP from request headers. */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = clientIp(req);

  // ── Rate limiting ───────────────────────────────────────────────────────────

  // Auth endpoints: brute-force protection (10 req / 15 min per IP).
  if (pathname.startsWith("/api/auth") || pathname === "/login" || pathname === "/register") {
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
  if (pathname.startsWith("/api/webhooks")) {
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
  if (pathname.startsWith("/repair-request")) {
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
  if (pathname.startsWith("/api/") &&
      !pathname.startsWith("/api/auth") &&
      !pathname.startsWith("/api/webhooks")) {
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

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const sessionCookie = getSessionCookie(req);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Allow onboarding (authenticated users without an org land here).
  if (pathname.startsWith(ONBOARDING_PATH)) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|images|uploads).*)",
  ],
};
