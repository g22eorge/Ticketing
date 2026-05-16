import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
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
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobsWithBill = await prisma.job.findMany({
    where: { externalTechBill: { not: null } },
    select: { id: true, jobNumber: true, externalTechBill: true, externalTechFee: true },
  });

  let updated = 0;
  const results = [];

  for (const job of jobsWithBill) {
    if (job.externalTechBill === job.externalTechFee) continue;
    await prisma.job.update({
      where: { id: job.id },
      data: { externalTechFee: job.externalTechBill },
    });
    updated += 1;
    results.push({ jobNumber: job.jobNumber, old: job.externalTechFee, new: job.externalTechBill });
  }

  return NextResponse.json({
    message: "Sync complete",
    updated,
    total: jobsWithBill.length,
    details: results.slice(0, 20),
  });
}
