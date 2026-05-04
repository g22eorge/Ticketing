#!/usr/bin/env bun

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting externalTechFee sync migration...");

  const jobsWithBill = await prisma.job.findMany({
    where: {
      externalTechBill: { not: null },
    },
    select: {
      id: true,
      jobNumber: true,
      externalTechBill: true,
      externalTechFee: true,
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const job of jobsWithBill) {
    if (job.externalTechBill === job.externalTechFee) {
      skipped += 1;
      continue;
    }
    await prisma.job.update({
      where: { id: job.id },
      data: { externalTechFee: job.externalTechBill },
    });
    updated += 1;
  }

  console.log(`Synced ${updated} jobs. Skipped ${skipped} (already matching).`);
  console.log("Done.");
}

main()
  .catch(async (error) => {
    console.error("Migration failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
