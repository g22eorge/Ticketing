import { type NextRequest, NextResponse } from "next/server";

/**
 * Edge-level auth guard.
 *
 * Reads the BetterAuth session cookie and redirects unauthenticated visitors
 * to /login. All public paths listed below are passed through unconditionally.
 *
 * NOTE: This runs on Vercel Edge Runtime — keep it dependency-free (no Prisma,
 * no BetterAuth server, no Node.js-only modules). Cookie presence is a
 * sufficient signal here; the real session validation happens inside each
 * Server Component / API route via requireOrgSession().
 */

// Cookie name emitted by BetterAuth (must match lib/auth.ts configuration).
const SESSION_COOKIE = "better-auth.session_token";

// Paths that must be accessible without a session.
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/api/auth",          // BetterAuth sign-in / sign-out / OAuth endpoints
  "/api/billing/callback", // Pesapal payment redirect (arrives without session)
  "/api/webhooks",      // Incoming webhooks (WhatsApp, etc.)
  "/api/cron",          // Scheduled jobs triggered by Vercel cron
  "/onboarding",        // New-user org setup flow
  "/feedback",          // Public feedback widget
  "/_next",             // Next.js static assets & HMR
  "/favicon",
  "/icon",
  "/apple-touch",
  "/robots",
  "/sitemap",
  "/uploads",           // Publicly served uploaded files
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through public paths without any cookie check.
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Pass through static file extensions.
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|ttf|otf|map)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Check for a session cookie.
  const sessionCookie =
    request.cookies.get(SESSION_COOKIE) ??
    request.cookies.get(`__Secure-${SESSION_COOKIE}`); // HTTPS-prefixed variant

  if (!sessionCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Run on every request except Next.js internals and static files that are
   * never under authentication (images, fonts, etc.).  The regex below is the
   * standard Next.js recommendation.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
