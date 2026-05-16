/**
 * lib/platform-admin.ts
 *
 * Single source of truth for the platform-admin identity check.
 *
 * TWO exports for the two calling conventions across this codebase:
 *
 *  requirePlatformAdmin()   — for Server Components, layouts, and server
 *                             actions. Redirects to /dashboard if the caller
 *                             is not the platform admin. Never returns null.
 *
 *  assertPlatformAdmin()    — for API route handlers that need to return a
 *                             proper 403 JSON response. Returns the user or
 *                             null so the caller can do the response itself.
 *
 * Both variants:
 *  • Compare emails case-insensitively (env vars may be typed inconsistently).
 *  • Require the user's role to be "ADMIN" — a matching email with a
 *    downgraded role must not gain platform access.
 *  • Fail closed: if PLATFORM_ADMIN_EMAIL is not configured, no one is admin.
 */

import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";

type PlatformUser = Awaited<ReturnType<typeof getCurrentUserRole>>["user"];

/** Shared check — returns the user if they are the platform admin, null otherwise. */
async function checkPlatformAdmin(): Promise<NonNullable<PlatformUser> | null> {
  const { user } = await getCurrentUserRole();
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) return null;
  if (!user?.email) return null;
  if (user.email.toLowerCase() !== adminEmail) return null;
  if (user.role !== "ADMIN") return null;

  return user as NonNullable<PlatformUser>;
}

/**
 * Use in Server Components, layouts, and server actions.
 * Redirects to /dashboard on failure — never returns null.
 */
export async function requirePlatformAdmin(): Promise<NonNullable<PlatformUser>> {
  const user = await checkPlatformAdmin();
  if (!user) redirect("/dashboard");
  return user;
}

/**
 * Use in API route handlers that return JSON.
 * Returns null (not undefined) when the check fails, so callers can:
 *
 *   const user = await assertPlatformAdmin();
 *   if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 */
export async function assertPlatformAdmin(): Promise<NonNullable<PlatformUser> | null> {
  return checkPlatformAdmin();
}

/**
 * Synchronous boolean helper for places that have already fetched the user
 * (e.g. the app layout that needs to conditionally render an admin sidebar link).
 *
 *   const isPlatformAdmin = checkIsPlatformAdmin(user.email);
 */
export function checkIsPlatformAdmin(email: string): boolean {
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(adminEmail && email.toLowerCase() === adminEmail);
}
