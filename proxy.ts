import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

// NOTE: Next.js 16 supports "proxy.ts" as the middleware entrypoint.
// Do not add a separate middleware.ts, or builds will fail.

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/login",
  "/api/repair-requests",

  // Simple memorable shortlinks.
  "/app",
  "/company",
  "/repair",
  "/address",

  // Public shortlinks (continued).
  "/profile",

  // Public metadata assets for link previews, icons, and static images.
  "/opengraph-image",
  "/twitter-image",
  "/apple-icon",
  "/icon.svg",
  "/eagle-info-logo.png",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/") {
    return NextResponse.next();
  }

  const session = getSessionCookie(req);

  // Redirect authenticated users away from the login page.
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackURL", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|uploads).*)"],
};
