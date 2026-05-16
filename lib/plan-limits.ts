/**
 * plan-limits.ts
 *
 * Defines per-plan quotas and runtime enforcement helpers.
 * All limit checks go through this file — never hard-code limits elsewhere.
 */

import { OrgPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Quota definitions ─────────────────────────────────────────────────────────

export type PlanLimits = {
  maxUsers: number;           // active users in the org (ADMIN, OPS, techs, etc.)
  maxJobsPerMonth: number;    // jobs created in the current calendar month
  maxParts: number;           // distinct SKUs in inventory
  maxBranches: number;
  maxSuppliers: number;
  maxSalesPerMonth: number;
  maxPurchaseOrdersPerMonth: number;
  maxRepairRequestsPerMonth: number;
  customBranding: boolean;    // can customise invoice/document branding
  inviteLinks: boolean;       // can generate invite links (vs manual create only)
};

export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  STARTER: {
    maxUsers: 5,
    maxJobsPerMonth: 150,
    maxParts: 100,
    maxBranches: 1,
    maxSuppliers: 25,
    maxSalesPerMonth: 300,
    maxPurchaseOrdersPerMonth: 50,
    maxRepairRequestsPerMonth: 300,
    customBranding: false,
    inviteLinks: true,
  },
  GROWTH: {
    maxUsers: 40,
    maxJobsPerMonth: 2000,
    maxParts: 2000,
    maxBranches: 8,
    maxSuppliers: 500,
    maxSalesPerMonth: 5000,
    maxPurchaseOrdersPerMonth: 1000,
    maxRepairRequestsPerMonth: 5000,
    customBranding: true,
    inviteLinks: true,
  },
  ENTERPRISE: {
    maxUsers: Infinity,
    maxJobsPerMonth: Infinity,
    maxParts: Infinity,
    maxBranches: Infinity,
    maxSuppliers: Infinity,
    maxSalesPerMonth: Infinity,
    maxPurchaseOrdersPerMonth: Infinity,
    maxRepairRequestsPerMonth: Infinity,
    customBranding: true,
    inviteLinks: true,
  },
};

export const PLAN_LABELS: Record<OrgPlan, string> = {
  STARTER:    "Starter",
  GROWTH:     "Growth",
  ENTERPRISE: "Enterprise",
};

export const UPGRADE_PLAN: Partial<Record<OrgPlan, OrgPlan>> = {
  STARTER:  "GROWTH",
  GROWTH:   "ENTERPRISE",
};

// ── Runtime helpers ───────────────────────────────────────────────────────────

/** Fetch the org's current plan. Returns STARTER if org not found (safe default). */
export async function getOrgPlan(orgId: string): Promise<OrgPlan> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });
  return org?.plan ?? "STARTER";
}

/** Returns the limit object for a given org. */
export async function getLimitsForOrg(orgId: string): Promise<PlanLimits & { plan: OrgPlan }> {
  const plan = await getOrgPlan(orgId);
  return { ...PLAN_LIMITS[plan], plan };
}

// ── Specific limit checks ─────────────────────────────────────────────────────

export type LimitCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; limit: number; current: number; upgradeTo: OrgPlan | null };

/** Can this org create another active user (invite or direct create)? */
export async function checkUserLimit(orgId: string): Promise<LimitCheckResult> {
  const { plan, maxUsers } = await getLimitsForOrg(orgId);
  if (maxUsers === Infinity) return { allowed: true };

  const current = await prisma.user.count({
    where: { orgId, isActive: true },
  });

  if (current < maxUsers) return { allowed: true };

  return {
    allowed: false,
    reason: `Your ${PLAN_LABELS[plan]} plan allows up to ${maxUsers} active users. You've reached the limit.`,
    limit: maxUsers,
    current,
    upgradeTo: UPGRADE_PLAN[plan] ?? null,
  };
}

/** Can this org create another job this month? */
export async function checkJobLimit(orgId: string): Promise<LimitCheckResult> {
  const { plan, maxJobsPerMonth } = await getLimitsForOrg(orgId);
  if (maxJobsPerMonth === Infinity) return { allowed: true };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const current = await prisma.job.count({
    where: { orgId, receivedAt: { gte: monthStart } },
  });

  if (current < maxJobsPerMonth) return { allowed: true };

  return {
    allowed: false,
    reason: `Your ${PLAN_LABELS[plan]} plan allows up to ${maxJobsPerMonth} jobs per month. You've used ${current} this month.`,
    limit: maxJobsPerMonth,
    current,
    upgradeTo: UPGRADE_PLAN[plan] ?? null,
  };
}

/** Can this org add another part SKU to inventory? */
export async function checkPartLimit(orgId: string): Promise<LimitCheckResult> {
  const { plan, maxParts } = await getLimitsForOrg(orgId);
  if (maxParts === Infinity) return { allowed: true };

  const current = await prisma.part.count({
    where: { orgId, isActive: true },
  });

  if (current < maxParts) return { allowed: true };

  return {
    allowed: false,
    reason: `Your ${PLAN_LABELS[plan]} plan allows up to ${maxParts} parts in inventory. You've reached the limit.`,
    limit: maxParts,
    current,
    upgradeTo: UPGRADE_PLAN[plan] ?? null,
  };
}
