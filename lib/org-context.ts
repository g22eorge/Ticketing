/**
 * org-context.ts
 *
 * Central helper for multi-tenant org scoping.
 *
 * All server actions and page components that touch business data
 * should call requireOrgSession() instead of getCurrentUserRole()
 * directly. This guarantees:
 *   1. The user is authenticated.
 *   2. The user belongs to an org — otherwise they're redirected to /onboarding.
 *   3. The orgId is always available for Prisma query scoping.
 */

import { redirect } from "next/navigation";

import { getAppCurrency, normalizeCurrency, parseSupportedCurrencies } from "@/lib/currency";
import { getOrgAccess } from "@/lib/billing-access";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole, getCurrentUserRoleOptional } from "@/lib/session";

/** Use in server components and server actions that require a full org context. */
export async function requireOrgSession() {
  const { session, user } = await getCurrentUserRole();

  if (!user!.orgId) {
    if (process.env.PLATFORM_ADMIN_EMAIL && user!.email === process.env.PLATFORM_ADMIN_EMAIL) {
      redirect("/platform");
    }
    redirect("/onboarding");
  }

  const orgId = user!.orgId as string;
  const orgRow = await prisma.organization
    .findUnique({
      where: { id: orgId },
      select: {
        baseCurrency: true,
        supportedCurrencies: true,
        plan: true,
        billingStatus: true,
        trialEndsAt: true,
        planRenewsAt: true,
        planCancelledAt: true,
      },
    })
    .catch(() => null);
  const baseCurrency = normalizeCurrency(orgRow?.baseCurrency, getAppCurrency());
  const supportedCurrencies = parseSupportedCurrencies(orgRow?.supportedCurrencies, baseCurrency);
  const access = getOrgAccess(orgRow ? {
    plan: orgRow.plan,
    billingStatus: orgRow.billingStatus,
    trialEndsAt: orgRow.trialEndsAt ?? null,
    planRenewsAt: orgRow.planRenewsAt ?? null,
    planCancelledAt: orgRow.planCancelledAt ?? null,
  } : null);

  return {
    session,
    user: user!,
    orgId,
    org: {
      baseCurrency,
      supportedCurrencies,
      plan: orgRow?.plan ?? "STARTER",
      billingStatus: orgRow?.billingStatus ?? "TRIALING",
      trialEndsAt: orgRow?.trialEndsAt ?? null,
      planRenewsAt: orgRow?.planRenewsAt ?? null,
      planCancelledAt: orgRow?.planCancelledAt ?? null,
      access,
    },
  };
}

/**
 * Use in API routes / background workers that must not redirect.
 * Returns null orgId if the user has no org — caller decides what to do.
 */
export async function getOrgSessionOptional() {
  const { session, user } = await getCurrentUserRoleOptional();

  return {
    session,
    user,
    orgId: user?.orgId ?? null,
  };
}

/**
 * Minimal org-scoped where clause fragment.
 * Merge this into any Prisma query's `where` to enforce tenant isolation.
 *
 * Usage:
 *   const { orgId } = await requireOrgSession();
 *   const jobs = await prisma.job.findMany({ where: { ...orgWhere(orgId), status: "RECEIVED" } });
 */
export function orgWhere(orgId: string) {
  return { orgId } as const;
}
