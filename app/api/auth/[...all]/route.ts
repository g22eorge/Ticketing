import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const preferredRegion = "sfo1";

const { GET: _GET, POST: _POST } = toNextJsHandler(auth);

export { _GET as GET };

/**
 * POST handler — wraps the BetterAuth handler with rate limiting for
 * authentication endpoints that are susceptible to brute-force attacks.
 *
 * The custom /api/login route already has rate limiting, but callers that
 * bypass it and POST directly to /api/auth/sign-in/email (e.g. the authClient
 * SDK) had no protection.  This closes that gap.
 *
 * Limits applied:
 *   • /sign-in/email          — 10 attempts per minute per IP
 *   • /sign-up/email          — 5 attempts per 10 minutes per IP
 *   • /reset-password / /send-verification-email  — 5 per 10 minutes per IP
 *
 * All other paths (OAuth callbacks, session refresh, sign-out) pass through
 * without rate limiting.
 */
export async function POST(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const ip = getClientIp(request);

  // Platform admin is always exempt (matched later during credential check,
  // but we check the same env var for a quick bypass without a DB query).
  const platformAdmin = process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase();
  let isExempt = false;
  if (platformAdmin && path.endsWith("/sign-in/email")) {
    try {
      const body = await request.clone().json();
      isExempt = typeof body.email === "string" && body.email.toLowerCase() === platformAdmin;
    } catch {
      // ignore parse errors
    }
  }

  if (!isExempt) {
    let rl: { allowed: boolean; retryAfterMs: number } | null = null;

    if (path.endsWith("/sign-in/email")) {
      rl = checkRateLimit(`ba-signin:${ip}`, { limit: 10, windowMs: 60_000 });
    } else if (path.endsWith("/sign-up/email")) {
      rl = checkRateLimit(`ba-signup:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
    } else if (
      path.endsWith("/reset-password") ||
      path.endsWith("/send-verification-email") ||
      path.endsWith("/forget-password")
    ) {
      rl = checkRateLimit(`ba-passreset:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
    }

    if (rl && !rl.allowed) {
      return NextResponse.json(
        { message: "Too many requests. Please wait before trying again.", code: "RATE_LIMITED" },
        { status: 429, headers: rateLimitHeaders(rl.retryAfterMs) },
      );
    }
  }

  return _POST(request);
}
