import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { getPlatformHealthChecks } from "@/lib/platform-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const checks = await getPlatformHealthChecks();
    const ok = Object.values(checks).every((check) => check.ok);
    return NextResponse.json({
      ok,
      checkedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
      checks,
    }, { status: ok ? 200 : 503 });
  } catch (err) {
    console.error("[admin/platform-health] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
