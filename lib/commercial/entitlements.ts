import { OrgPlan } from "@prisma/client";

import { getLimitsForOrg, PLAN_LIMITS, type PlanLimits } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";

type EntitlementValue = boolean | number | string | null;

export async function getOrgEntitlements(orgId: string): Promise<Record<string, EntitlementValue>> {
  const limits = await getLimitsForOrg(orgId);
  const overrides = await prisma.orgFeatureEntitlement
    .findMany({ where: { orgId, enabled: true } })
    .catch(() => []);

  const base: Record<string, EntitlementValue> = planLimitsToEntitlements(limits.plan, limits);
  for (const override of overrides) {
    base[override.feature] = override.limitValue ?? true;
  }
  return base;
}

export function planLimitsToEntitlements(plan: OrgPlan, limits: PlanLimits = PLAN_LIMITS[plan]) {
  return {
    plan,
    customBranding: limits.customBranding,
    inviteLinks: limits.inviteLinks,
    maxUsers: limits.maxUsers,
    maxJobsPerMonth: limits.maxJobsPerMonth,
    maxParts: limits.maxParts,
    maxBranches: limits.maxBranches,
    maxSuppliers: limits.maxSuppliers,
    maxSalesPerMonth: limits.maxSalesPerMonth,
    maxPurchaseOrdersPerMonth: limits.maxPurchaseOrdersPerMonth,
    maxRepairRequestsPerMonth: limits.maxRepairRequestsPerMonth,
  } satisfies Record<string, EntitlementValue>;
}
