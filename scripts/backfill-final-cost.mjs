#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const targets = await prisma.job.findMany({
    where: { status: "COMPLETED", clientBill: null },
    select: { id: true, jobNumber: true, externalTechBill: true },
  });

  if (targets.length === 0) {
    console.log("OK: no completed jobs missing clientBill.");
    process.exit(0);
  }

  let updated = 0;
  for (const job of targets) {
    const clientBill = job.externalTechBill ?? 0;
    await prisma.job.update({
      where: { id: job.id },
      data: { clientBill },
    });
    updated += 1;
    console.log(`UPDATED: ${job.jobNumber} clientBill=${clientBill}`);
  }

  console.log(`OK: backfilled ${updated} completed jobs.`);
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
