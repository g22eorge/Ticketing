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

    const toUpdate = jobsWithBill.filter((job) => job.externalTechBill !== job.externalTechFee);
    const results = toUpdate.map((job) => ({ jobNumber: job.jobNumber, old: job.externalTechFee, new: job.externalTechBill }));

    // Batch all updates in a single transaction instead of one-by-one N+1
    if (toUpdate.length > 0) {
      await prisma.$transaction(
        toUpdate.map((job) =>
          prisma.job.update({ where: { id: job.id }, data: { externalTechFee: job.externalTechBill } })
        )
      );
    }

    const updated = toUpdate.length;

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
