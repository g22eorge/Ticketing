import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Paths that do not require an authenticated session.
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/address",
  "/company",
  "/repair",
  "/api/auth",
  "/api/login",
  "/api/webhooks",
  "/api/meta",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isPublic) return NextResponse.next();

  const session = getSessionCookie(request);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the intended destination so the login page can redirect back.
    if (pathname !== "/login") {
      loginUrl.searchParams.set("callbackURL", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run middleware on all paths except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|opengraph-image|twitter-image|robots.txt|sitemap.xml).*)",
  ],
};
