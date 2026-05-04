import { NextRequest, NextResponse } from "next/server";

import { runDataHeal } from "@/lib/data-heal";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const unresolved = await prisma.job.count({
    where: { OR: [{ brand: "Unknown" }, { model: "Unknown" }, { deviceType: "OTHER" }] },
  });
  const lastHeal = await prisma.auditLog.findFirst({
    where: { action: "DATA_HEAL_JOB_DEVICE_FIELDS" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  const preview = await runDataHeal(prisma, { dryRun: true, limit: 25 });

  return NextResponse.json({
    ok: true,
    unresolved,
    lastHealedAt: lastHeal?.createdAt ?? null,
    dryRun,
    preview,
  });
}

export async function POST(request: NextRequest) {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  const result = await runDataHeal(prisma, { dryRun, actorUserId: user.id });
  return NextResponse.json(result);
}
