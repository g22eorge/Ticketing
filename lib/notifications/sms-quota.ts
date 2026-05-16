import { prisma } from "@/lib/prisma";
import { OrgPlan } from "@prisma/client";

export const SMS_PLAN_QUOTAS: Record<OrgPlan, number> = {
  STARTER:    200,
  STANDARD:   500,
  GROWTH:    1000,
  PREMIUM:   3000,
  ENTERPRISE: 5000,
};

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SmsUsage" (
      orgId TEXT NOT NULL,
      year  INTEGER NOT NULL,
      month INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (orgId, year, month)
    )
  `);
  tableEnsured = true;
}

export async function getSmsUsage(orgId: string, year?: number, month?: number): Promise<number> {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count FROM "SmsUsage" WHERE orgId = ${orgId} AND year = ${y} AND month = ${m}
    `;
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function incrementSmsUsage(orgId: string): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  await ensureTable();
  await prisma.$executeRaw`
    INSERT INTO "SmsUsage" (orgId, year, month, count) VALUES (${orgId}, ${year}, ${month}, 1)
    ON CONFLICT(orgId, year, month) DO UPDATE SET count = count + 1
  `;
}

export interface SmsQuota {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  plan: string;
  percentUsed: number;
}

export async function checkSmsQuota(orgId: string): Promise<SmsQuota> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });
    const plan = (org?.plan ?? "STARTER") as OrgPlan;
    const limit = SMS_PLAN_QUOTAS[plan] ?? 200;
    const used = await getSmsUsage(orgId);
    const remaining = Math.max(0, limit - used);
    return {
      allowed: used < limit,
      used,
      limit,
      remaining,
      plan,
      percentUsed: limit > 0 ? Math.round((used / limit) * 100) : 0,
    };
  } catch {
    return { allowed: true, used: 0, limit: 200, remaining: 200, plan: "STARTER", percentUsed: 0 };
  }
}

export async function getAllOrgsSmsBudgetThisMonth(): Promise<
  Array<{ orgId: string; orgName: string; plan: string; count: number; limit: number }>
> {
  try {
    await ensureTable();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT su.orgId, su.count, o.name as orgName, o.plan
      FROM "SmsUsage" su
      LEFT JOIN "Organization" o ON o.id = su.orgId
      WHERE su.year = ${year} AND su.month = ${month}
      ORDER BY su.count DESC
    `;
    return rows.map((r) => ({
      orgId: String(r.orgId),
      orgName: r.orgName ? String(r.orgName) : "Unknown",
      plan: r.plan ? String(r.plan) : "STARTER",
      count: Number(r.count),
      limit: SMS_PLAN_QUOTAS[(r.plan as OrgPlan) ?? "STARTER"] ?? 200,
    }));
  } catch {
    return [];
  }
}
