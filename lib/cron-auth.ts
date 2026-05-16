/**
 * Shared cron-job authentication helper.
 *
 * Security rules enforced here (S4 + S5):
 *
 *  S4 — The `x-vercel-cron: 1` header bypass is removed.  That header can be
 *       spoofed by any caller who knows it exists; it MUST NOT grant access on
 *       its own.
 *
 *  S5 — Secrets in URL query parameters (?secret=...) appear in server logs,
 *       CDN access logs, referrer headers, and browser history.  We only accept
 *       the secret via the `Authorization: Bearer <secret>` request header.
 *
 * Vercel Cron automatically injects `Authorization: Bearer <CRON_SECRET>` when
 * `CRON_SECRET` is set as an environment variable in the project settings — no
 * extra vercel.json changes needed.
 *
 * Usage:
 *   import { assertCronAuthorized } from "@/lib/cron-auth";
 *
 *   export async function POST(request: NextRequest) {
 *     const authError = assertCronAuthorized(request);
 *     if (authError) return authError;
 *     // ... safe to proceed
 *   }
 */

import { type NextRequest, NextResponse } from "next/server";

/** Returns a 403 Response when the request is not authorized, null otherwise. */
export function assertCronAuthorized(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    // CRON_SECRET not configured — only allow in non-production environments
    // so local development still works without the variable set.
    if (process.env.NODE_ENV === "production") {
      console.error("[cron] CRON_SECRET is not set — rejecting cron request in production");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Dev/test: allow through without a secret.
    return null;
  }

  // Accept the secret ONLY from the Authorization header, never from URLs.
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null; // authorized
}
