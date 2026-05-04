import { NextRequest, NextResponse } from "next/server";

import { runDataHeal } from "@/lib/data-heal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const secret = process.env.CRON_SECRET;
  const provided = request.nextUrl.searchParams.get("secret");
  const dryRun = request.nextUrl.searchParams.get("dry") === "1";

  if (!isVercelCron && (!secret || provided !== secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runDataHeal(prisma, { dryRun });
  return NextResponse.json(result);
}
