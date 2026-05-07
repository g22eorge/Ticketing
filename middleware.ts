import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/webhooks",
  "/repair-request",  // public intake form
];

const ONBOARDING_PATH = "/onboarding";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths and static assets.
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Check session cookie. BetterAuth sets this on login.
  const sessionCookie = getSessionCookie(req);

  if (!sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Allow onboarding route (authenticated users without an org land here).
  if (pathname.startsWith(ONBOARDING_PATH)) {
    return NextResponse.next();
  }

  // All other authenticated routes are allowed through.
  // Org-check happens at the page/action level via requireOrgSession(),
  // which redirects to /onboarding if orgId is missing.
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|icons|images|uploads).*)",
  ],
};
