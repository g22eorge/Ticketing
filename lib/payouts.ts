import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getTableColumns } from "@/lib/db-utils";

export type JobPayoutSnapshot = {
  id: string;
  externalTechFee: number | null;
  externalPaid: boolean;
  externalPaidAt: Date | null;
  externalPaymentRef: string | null;
};

export type TechnicianPayoutTotal = {
  jobId: string;
  paidAmount: number;
};

let payoutColumnsPresentCache: boolean | null = null;

export async function hasJobPayoutColumns() {
  if (payoutColumnsPresentCache !== null) {
    return payoutColumnsPresentCache;
  }

  try {
    const names = await getTableColumns("Job");
    payoutColumnsPresentCache =
      names.has("externalTechFee") &&
      names.has("externalPaid") &&
      names.has("externalPaidAt") &&
      names.has("externalPaymentRef");
  } catch {
    payoutColumnsPresentCache = false;
  }

  return payoutColumnsPresentCache;
}

export async function getJobPayoutsByIds(jobIds: string[]) {
  if (jobIds.length === 0 || !(await hasJobPayoutColumns())) {
    return new Map<string, JobPayoutSnapshot>();
  }

  const ids = [...new Set(jobIds)];
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    externalTechFee: number | null;
    externalPaid: boolean | number | null;
    externalPaidAt: Date | string | null;
    externalPaymentRef: string | null;
  }>>(
    Prisma.sql`
      SELECT
        id,
        externalTechFee,
        externalPaid,
        externalPaidAt,
        externalPaymentRef
      FROM "Job"
      WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
    `,
  );

  const map = new Map<string, JobPayoutSnapshot>();
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      externalTechFee: row.externalTechFee,
      externalPaid: Boolean(row.externalPaid),
      externalPaidAt: row.externalPaidAt ? new Date(row.externalPaidAt) : null,
      externalPaymentRef: row.externalPaymentRef,
    });
  }

  return map;
}

export async function getTechnicianPayoutTotalsByJobIds(jobIds: string[]) {
  if (jobIds.length === 0) {
    return new Map<string, TechnicianPayoutTotal>();
  }

  const ids = [...new Set(jobIds)];
  const rows = await prisma.technicianPayout
    .groupBy({
      by: ["jobId"],
      where: { jobId: { in: ids } },
      _sum: { amount: true },
    })
    .catch(() => []);

  const map = new Map<string, TechnicianPayoutTotal>();
  for (const row of rows) {
    map.set(row.jobId, {
      jobId: row.jobId,
      paidAmount: row._sum.amount ?? 0,
    });
  }

  return map;
}
