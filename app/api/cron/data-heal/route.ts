import { NextRequest, NextResponse } from "next/server";

import { runDataHeal } from "@/lib/data-heal";
import { prisma } from "@/lib/prisma";
import { assertCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = assertCronAuthorized(request);
  if (authError) return authError;

  try {
    const dryRun = request.nextUrl.searchParams.get("dry") === "1";
    const result = await runDataHeal(prisma, { dryRun });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/data-heal] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
