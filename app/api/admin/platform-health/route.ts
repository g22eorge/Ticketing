import { NextResponse } from "next/server";

import { getPlatformHealthChecks } from "@/lib/platform-health";
import { getCurrentUserRole } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requirePlatformAdmin() {
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformEmail || !user?.email || user.email !== platformEmail) return null;
  if (user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const user = await requirePlatformAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const checks = await getPlatformHealthChecks();
  const ok = Object.values(checks).every((check) => check.ok);
  return NextResponse.json({
    ok,
    checkedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "unknown",
    checks,
  }, { status: ok ? 200 : 503 });
}
