import { NextRequest, NextResponse } from "next/server";

/**
 * Edge-layer route protection.
 *
 * Checks for a BetterAuth session cookie and redirects unauthenticated
 * requests to /login before the server component even starts rendering.
 * Server components still call requireOrgSession() for role checks, so
 * this is a fast-fail layer, not the sole auth guard.
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/invite/",
  "/onboarding",
  "/api/auth",
  "/api/webhooks",
  "/api/webhook",
  "/api/pesapal",
  "/_next",
  "/favicon.ico",
];

const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  if (!hasSessionCookie(req)) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
