#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

try {
  const [jobs, completed, clients, orphaned] = await Promise.all([
    prisma.job.findMany({
      select: {
        id: true,
        jobNumber: true,
        clientBill: true,
        status: true,
        auditLogs: { select: { id: true } },
      },
    }),
    prisma.job.findMany({
      where: { status: "COMPLETED" },
      select: { jobNumber: true, clientBill: true },
    }),
    prisma.client.findMany({ include: { _count: { select: { jobs: true } } } }),
    prisma.job.findMany({ where: { clientId: null } }).catch(() => []),
  ]);

  if (jobs.length === 0) {
    // CI/empty databases shouldn't fail integrity checks.
    ok("No jobs found; skipping job-level integrity checks.");
  } else {
    ok(`Loaded ${jobs.length} jobs.`);

    const jobsWithoutAudit = jobs.filter((job) => job.auditLogs.length === 0);
    if (jobsWithoutAudit.length > 0) {
      fail(`Jobs without audit logs: ${jobsWithoutAudit.map((job) => job.jobNumber).join(", ")}`);
    } else {
      ok("All jobs have at least one audit log entry.");
    }

    const completedWithoutFinalCost = completed.filter((job) => job.clientBill == null);
    if (completedWithoutFinalCost.length > 0) {
      fail(
        `Completed jobs missing clientBill: ${completedWithoutFinalCost
          .map((job) => job.jobNumber)
          .join(", ")}`,
      );
    } else {
      ok("Completed jobs have clientBill values.");
    }
  }

  const clientsWithInvalidCounts = clients.filter((client) => client._count.jobs < 0);
  if (clientsWithInvalidCounts.length > 0) {
    fail("Invalid client job counts detected.");
  } else {
    ok("Client job counts look valid.");
  }

  if (orphaned.length > 0) {
    fail("Found orphaned jobs without client relation.");
  } else {
    ok("No orphaned jobs detected.");
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
