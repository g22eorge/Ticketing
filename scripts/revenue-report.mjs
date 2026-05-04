#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const now = new Date();
  const completed = await prisma.job.findMany({
    where: { status: "COMPLETED", clientBill: { not: null } },
    select: { clientBill: true, completedAt: true, receivedAt: true },
  });

  const inMonth = completed.filter(
    (job) =>
      job.completedAt &&
      job.completedAt.getMonth() === now.getMonth() &&
      job.completedAt.getFullYear() === now.getFullYear(),
  );

  const revenueThisMonth = inMonth.reduce((sum, job) => sum + (job.clientBill ?? 0), 0);
  const avgRepairHours = inMonth.length
    ? inMonth.reduce(
        (sum, job) => sum + ((job.completedAt.getTime() - job.receivedAt.getTime()) / 36e5),
        0,
      ) / inMonth.length
    : 0;

  console.log(
    JSON.stringify(
      {
        completedJobsWithFinalCost: completed.length,
        completedJobsThisMonth: inMonth.length,
        revenueThisMonth,
        averageRepairHoursThisMonth: Number(avgRepairHours.toFixed(2)),
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
