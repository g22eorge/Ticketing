import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
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
  } catch (err) {
    console.error("[admin/sync-tech-fee] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
