import type { OrgBillingStatus, OrgPlan } from "@prisma/client";

export type OrgBillingSnapshot = {
  plan: OrgPlan;
  billingStatus: OrgBillingStatus;
  trialEndsAt: Date | null;
  planRenewsAt: Date | null;
  planCancelledAt: Date | null;
};

export type OrgAccess = {
  isSuspended: boolean;
  reason: "TRIAL_EXPIRED" | "PAST_DUE" | "CANCELLED" | null;
};

export function getOrgAccess(org: OrgBillingSnapshot | null): OrgAccess {
  if (!org) return { isSuspended: false, reason: null };
  const now = new Date();

  const trialExpired =
    org.billingStatus === "TRIALING" &&
    org.trialEndsAt != null &&
    org.trialEndsAt < now;

  if (trialExpired) return { isSuspended: true, reason: "TRIAL_EXPIRED" };
  if (org.billingStatus === "PAST_DUE") return { isSuspended: true, reason: "PAST_DUE" };

  // Cancelled should remain usable until the period ends. After that we treat it as suspended
  // (layout may downgrade it separately).
  if (org.billingStatus === "CANCELLED" && org.planRenewsAt && org.planRenewsAt < now) {
    return { isSuspended: true, reason: "CANCELLED" };
  }

  return { isSuspended: false, reason: null };
}

export function suspensionMessage(access: OrgAccess) {
  if (!access.isSuspended) return null;
  if (access.reason === "TRIAL_EXPIRED") return "Your trial has ended. This workspace is read-only until you upgrade.";
  if (access.reason === "PAST_DUE") return "Payment is overdue. This workspace is read-only until billing is restored.";
  if (access.reason === "CANCELLED") return "Subscription ended. This workspace is read-only until billing is restored.";
  return "This workspace is read-only.";
}

export function canRecordPaymentsWhenSuspended(role: string) {
  return role === "ADMIN";
}
